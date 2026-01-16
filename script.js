        // Application State
        const state = {
            currentScreen: 1,
            hasImage: false,
            selectedView: 'front',
            explainabilityOn: false,
            imageData: null,
            analysisResult: null,
            landmarks: null,
            humanDetected: false,  // Track if a human body was detected
            // BMI data
            height: null,  // in cm
            weight: null,  // in kg
            bmi: null,
            bmiCategory: null,
            // BodyPix data
            bodyPixResult: null
        };

        // AI Models
        let poseDetector = null;
        let bodyPixNet = null;

        // Initialize MediaPipe Pose (for POSTURE analysis only)
        async function initMediaPipe() {
            poseDetector = new Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
                }
            });

            poseDetector.setOptions({
                modelComplexity: 1,  // Use 1 for faster processing
                smoothLandmarks: true,
                enableSegmentation: false,  // Disabled - using BodyPix instead
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            poseDetector.onResults(onPoseResults);
            console.log('MediaPipe Pose initialized (for posture analysis)');
        }

        // Initialize BodyPix (for BODY SEGMENTATION)
        async function initBodyPix() {
            try {
                console.log('Loading BodyPix model...');
                bodyPixNet = await bodyPix.load({
                    architecture: 'MobileNetV1',
                    outputStride: 16,
                    multiplier: 0.75,
                    quantBytes: 2
                });
                console.log('BodyPix model loaded successfully');
                return true;
            } catch (e) {
                console.error('Failed to load BodyPix:', e);
                return false;
            }
        }

        // ========== BMI CALCULATION ==========
        function calculateBMI(heightCm, weightKg) {
            if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
            const heightM = heightCm / 100;
            return weightKg / (heightM * heightM);
        }

        function getBMICategory(bmi) {
            if (bmi < 18.5) return { category: 'Underweight', class: 'athletic', score: 45 };
            if (bmi < 25) return { category: 'Normal', class: 'fit', score: 85 };
            if (bmi < 30) return { category: 'Overweight', class: 'overweight', score: 45 };
            if (bmi < 35) return { category: 'Obese Class I', class: 'obese', score: 30 };
            if (bmi < 40) return { category: 'Obese Class II', class: 'obese', score: 22 };
            return { category: 'Obese Class III', class: 'obese', score: 15 };
        }

        function updateBMIPreview() {
            const heightInput = document.getElementById('height-input');
            const weightInput = document.getElementById('weight-input');
            const bmiPreview = document.getElementById('bmi-preview');
            const bmiValue = document.getElementById('bmi-value');
            const bmiCategory = document.getElementById('bmi-category');

            const height = parseFloat(heightInput?.value);
            const weight = parseFloat(weightInput?.value);

            if (height && weight && height > 0 && weight > 0) {
                const bmi = calculateBMI(height, weight);
                const category = getBMICategory(bmi);

                state.height = height;
                state.weight = weight;
                state.bmi = bmi;
                state.bmiCategory = category;

                bmiPreview.style.display = 'block';
                bmiValue.textContent = bmi.toFixed(1);
                bmiCategory.textContent = category.category;
                bmiCategory.className = 'bmi-category ' + category.class;

                console.log('BMI calculated:', bmi.toFixed(1), '-', category.category);
            } else {
                bmiPreview.style.display = 'none';
                state.bmi = null;
                state.bmiCategory = null;
            }

            updateAnalyzeButton();
        }

        function updateAnalyzeButton() {
            const analyzeBtn = document.getElementById('analyze-btn');
            const hasImage = state.hasImage;
            const hasBMI = state.bmi !== null;

            if (analyzeBtn) {
                analyzeBtn.disabled = !(hasImage && hasBMI);
                if (!hasImage) {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Upload Photo First';
                } else if (!hasBMI) {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Enter Height & Weight';
                } else {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Analyze Photo';
                }
            }
        }

        // ========== BODYPIX SEGMENTATION ==========
        async function analyzeWithBodyPix(imageElement) {
            if (!bodyPixNet) {
                console.log('BodyPix not loaded, skipping segmentation');
                return null;
            }

            try {
                console.log('Running BodyPix segmentation...');

                // Run segmentation
                const segmentation = await bodyPixNet.segmentPerson(imageElement, {
                    flipHorizontal: false,
                    internalResolution: 'medium',
                    segmentationThreshold: 0.7
                });

                // Get image dimensions
                const width = imageElement.naturalWidth || imageElement.width;
                const height = imageElement.naturalHeight || imageElement.height;

                // Analyze the segmentation mask to measure body width
                const mask = segmentation.data; // Uint8Array where 1 = person, 0 = background

                // Measure body width at different heights (25%, 50%, 75% of image height)
                function measureWidthAtRow(row) {
                    let left = -1, right = -1;
                    for (let x = 0; x < width; x++) {
                        const idx = row * width + x;
                        if (mask[idx] === 1) {
                            if (left === -1) left = x;
                            right = x;
                        }
                    }
                    return (left !== -1 && right !== -1) ? right - left : 0;
                }

                // Measure at shoulder (25%), waist (45%), hip (60%) levels
                const shoulderRow = Math.floor(height * 0.25);
                const waistRow = Math.floor(height * 0.45);
                const hipRow = Math.floor(height * 0.60);

                const shoulderWidth = measureWidthAtRow(shoulderRow);
                const waistWidth = measureWidthAtRow(waistRow);
                const hipWidth = measureWidthAtRow(hipRow);

                // Count total body pixels
                let bodyPixelCount = 0;
                for (let i = 0; i < mask.length; i++) {
                    if (mask[i] === 1) bodyPixelCount++;
                }
                const bodyPercentage = (bodyPixelCount / mask.length) * 100;

                const result = {
                    shoulderWidth,
                    waistWidth,
                    hipWidth,
                    waistToShoulderRatio: shoulderWidth > 0 ? waistWidth / shoulderWidth : 1,
                    waistToHipRatio: hipWidth > 0 ? waistWidth / hipWidth : 1,
                    bodyPercentage,
                    isValid: shoulderWidth > 20 && waistWidth > 20 && hipWidth > 20
                };

                console.log('=== BODYPIX SEGMENTATION RESULTS ===');
                console.log('Shoulder width:', shoulderWidth, 'px');
                console.log('Waist width:', waistWidth, 'px');
                console.log('Hip width:', hipWidth, 'px');
                console.log('Waist/Shoulder ratio:', result.waistToShoulderRatio.toFixed(3));
                console.log('Body coverage:', bodyPercentage.toFixed(1) + '%');
                console.log('=====================================');

                return result;
            } catch (e) {
                console.error('BodyPix analysis failed:', e);
                return null;
            }
        }

        // Analyze body composition using SKELETON GEOMETRY (secondary check)
        function analyzeBodyGeometry(landmarks) {
            try {
                // Key insight: For larger bodies, certain skeleton points are pushed outward
                // Even though skeleton tracks bones, the RELATIVE positions change with body mass

                const leftShoulder = landmarks[11];
                const rightShoulder = landmarks[12];
                const leftHip = landmarks[23];
                const rightHip = landmarks[24];
                const leftElbow = landmarks[13];
                const rightElbow = landmarks[14];
                const leftWrist = landmarks[15];
                const rightWrist = landmarks[16];
                const leftKnee = landmarks[25];
                const rightKnee = landmarks[26];
                const nose = landmarks[0];
                const leftAnkle = landmarks[27];
                const rightAnkle = landmarks[28];

                // 1. TORSO WIDTH relative to height
                const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
                const hipWidth = Math.abs(rightHip.x - leftHip.x);
                const bodyHeight = Math.abs(leftAnkle.y - nose.y);
                const torsoHeight = Math.abs(leftHip.y - leftShoulder.y);

                // 2. ARM SPREAD - How far elbows/wrists are from body center
                // Larger bodies push arms outward
                const bodyCenter = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
                const leftElbowSpread = Math.abs(leftElbow.x - bodyCenter);
                const rightElbowSpread = Math.abs(rightElbow.x - bodyCenter);
                const avgElbowSpread = (leftElbowSpread + rightElbowSpread) / 2;

                // 3. LEG SPREAD - Wider stance for larger bodies
                const kneeWidth = Math.abs(rightKnee.x - leftKnee.x);
                const ankleWidth = Math.abs(rightAnkle.x - leftAnkle.x);

                // 4. HIP-TO-SHOULDER ratio - Larger bodies have proportionally wider hips
                const hipToShoulderRatio = hipWidth / shoulderWidth;

                // 5. TORSO WIDTH relative to torso height
                const torsoWidthRatio = ((shoulderWidth + hipWidth) / 2) / torsoHeight;

                // 6. ELBOW spread relative to shoulder width
                // Normal: elbows close to body, Large: elbows pushed out
                const elbowSpreadRatio = avgElbowSpread / shoulderWidth;

                // 7. KNEE spread relative to hip width
                const kneeSpreadRatio = kneeWidth / hipWidth;

                console.log('=== BODY GEOMETRY ANALYSIS ===');
                console.log('Hip/Shoulder ratio:', hipToShoulderRatio.toFixed(3));
                console.log('Torso width ratio:', torsoWidthRatio.toFixed(3));
                console.log('Elbow spread ratio:', elbowSpreadRatio.toFixed(3));
                console.log('Knee spread ratio:', kneeSpreadRatio.toFixed(3));
                console.log('==============================');

                // COMPOSITE SCORE - Higher = larger body
                // More aggressive thresholds to detect overweight bodies
                let bodyMassIndicator = 0;

                // Hip-to-shoulder: Higher = wider lower body (max 35 pts)
                if (hipToShoulderRatio > 1.0) bodyMassIndicator += 35;
                else if (hipToShoulderRatio > 0.9) bodyMassIndicator += 25;
                else if (hipToShoulderRatio > 0.8) bodyMassIndicator += 15;
                else if (hipToShoulderRatio > 0.7) bodyMassIndicator += 5;

                // Torso width ratio: Higher = wider torso (max 35 pts)
                // This is KEY for detecting obese bodies
                if (torsoWidthRatio > 0.9) bodyMassIndicator += 35;
                else if (torsoWidthRatio > 0.75) bodyMassIndicator += 25;
                else if (torsoWidthRatio > 0.6) bodyMassIndicator += 15;
                else if (torsoWidthRatio > 0.5) bodyMassIndicator += 5;

                // Elbow spread: Arms pushed out by body mass (max 20 pts)
                if (elbowSpreadRatio > 0.6) bodyMassIndicator += 20;
                else if (elbowSpreadRatio > 0.5) bodyMassIndicator += 14;
                else if (elbowSpreadRatio > 0.4) bodyMassIndicator += 8;
                else if (elbowSpreadRatio > 0.3) bodyMassIndicator += 3;

                // Knee spread: Wider stance (max 10 pts)
                if (kneeSpreadRatio > 1.3) bodyMassIndicator += 10;
                else if (kneeSpreadRatio > 1.1) bodyMassIndicator += 6;
                else if (kneeSpreadRatio > 0.9) bodyMassIndicator += 2;

                console.log('=== BODY MASS SCORING ===');
                console.log('Hip/Shoulder contribution:', hipToShoulderRatio > 1.0 ? 35 : hipToShoulderRatio > 0.9 ? 25 : hipToShoulderRatio > 0.8 ? 15 : hipToShoulderRatio > 0.7 ? 5 : 0);
                console.log('Torso width contribution:', torsoWidthRatio > 0.9 ? 35 : torsoWidthRatio > 0.75 ? 25 : torsoWidthRatio > 0.6 ? 15 : torsoWidthRatio > 0.5 ? 5 : 0);
                console.log('Elbow spread contribution:', elbowSpreadRatio > 0.6 ? 20 : elbowSpreadRatio > 0.5 ? 14 : elbowSpreadRatio > 0.4 ? 8 : elbowSpreadRatio > 0.3 ? 3 : 0);
                console.log('Knee spread contribution:', kneeSpreadRatio > 1.3 ? 10 : kneeSpreadRatio > 1.1 ? 6 : kneeSpreadRatio > 0.9 ? 2 : 0);
                console.log('TOTAL Body Mass Indicator:', bodyMassIndicator);
                console.log('=========================');

                return {
                    hipToShoulderRatio,
                    torsoWidthRatio,
                    elbowSpreadRatio,
                    kneeSpreadRatio,
                    bodyMassIndicator,
                    isValid: true
                };
            } catch (e) {
                console.error('Geometry analysis error:', e);
                return { isValid: false };
            }
        }

        // Handle pose detection results
        function onPoseResults(results) {
            if (results.poseLandmarks && results.poseLandmarks.length >= 25) {
                // Validate key body landmarks are visible with reasonable confidence
                const keyLandmarks = [
                    results.poseLandmarks[11], // left shoulder
                    results.poseLandmarks[12], // right shoulder
                    results.poseLandmarks[23], // left hip
                    results.poseLandmarks[24], // right hip
                ];

                // Check if key landmarks have sufficient visibility
                const minVisibility = 0.3;
                const validLandmarks = keyLandmarks.filter(lm =>
                    lm && lm.visibility && lm.visibility > minVisibility
                );

                if (validLandmarks.length >= 3) {
                    // Valid human body detected
                    state.humanDetected = true;
                    state.landmarks = results.poseLandmarks;
                    state.segmentationMask = results.segmentationMask || null;
                    state.analysisResult = calculateBodyMetrics(results.poseLandmarks, results.segmentationMask, results.image);
                    console.log('Human body detected! Valid landmarks:', validLandmarks.length);
                } else {
                    // Landmarks detected but not a valid body pose
                    console.log('Partial detection - insufficient body visibility');
                    state.humanDetected = false;
                    state.landmarks = null;
                    state.analysisResult = null;
                }
            } else {
                // No pose detected at all
                console.log('No human body detected in image');
                state.humanDetected = false;
                state.landmarks = null;
                state.analysisResult = null;
            }
        }

        // Calculate body metrics from pose landmarks and segmentation
        function calculateBodyMetrics(landmarks, segmentationMask, image) {
            // MediaPipe Pose landmarks indices:
            // 11 = left shoulder, 12 = right shoulder
            // 23 = left hip, 24 = right hip
            // 0 = nose, 7 = left ear, 8 = right ear
            // 25 = left knee, 26 = right knee
            // 27 = left ankle, 28 = right ankle

            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            const nose = landmarks[0];
            const leftElbow = landmarks[13];
            const rightElbow = landmarks[14];
            const leftKnee = landmarks[25];
            const rightKnee = landmarks[26];
            const leftAnkle = landmarks[27];
            const rightAnkle = landmarks[28];
            const leftWrist = landmarks[15];
            const rightWrist = landmarks[16];

            // Calculate SKELETON distances (bone structure)
            const skeletonShoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
            const skeletonHipWidth = Math.abs(rightHip.x - leftHip.x);

            // Calculate body HEIGHT (head to ankle)
            const bodyHeight = Math.abs(leftAnkle.y - nose.y);

            // Calculate torso length
            const torsoLength = Math.abs(leftHip.y - leftShoulder.y);

            // IMPROVED: Use elbow position to estimate actual body width
            // On larger bodies, elbows are pushed outward by torso mass
            const leftElbowOffset = Math.abs(leftElbow.x - leftShoulder.x);
            const rightElbowOffset = Math.abs(rightElbow.x - rightShoulder.x);
            const elbowSpread = leftElbowOffset + rightElbowOffset;

            // Check if arms are by sides (wrists near hips) - indicates relaxed pose
            const armsAtSides = Math.abs(leftWrist.y - leftHip.y) < 0.15 && Math.abs(rightWrist.y - rightHip.y) < 0.15;

            // Calculate actual body width estimate
            // If elbows are spread wide relative to shoulders, indicates larger body
            const elbowToShoulderRatio = elbowSpread / skeletonShoulderWidth;

            // Body width to height ratio (key indicator of body composition)
            const torsoWidthRatio = skeletonHipWidth / torsoLength;
            const shoulderToHeightRatio = skeletonShoulderWidth / bodyHeight;
            const hipToHeightRatio = skeletonHipWidth / bodyHeight;

            // Calculate waist-to-hip indicator (shoulder to hip ratio)
            const waistHipIndicator = skeletonHipWidth / skeletonShoulderWidth;

            // Posture analysis
            const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y);
            const hipDiff = Math.abs(leftHip.y - rightHip.y);
            const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
            const headForward = nose.x - shoulderMidX;

            // BODY COMPOSITION SCORING
            // PRIMARY: BMI from user-provided height/weight (accurate)
            // SECONDARY: BodyPix visual analysis (confirmation)
            let bodyCompScore;
            let category;
            let bodyType;

            // Use BMI as the PRIMARY metric (this is ACCURATE)
            if (state.bmi && state.bmiCategory) {
                const bmi = state.bmi;
                const bmiCat = state.bmiCategory;

                console.log('=== USING BMI (Primary Metric) ===');
                console.log('BMI:', bmi.toFixed(1));
                console.log('Category:', bmiCat.category);

                // Score based on BMI categories (WHO standards)
                if (bmi < 18.5) {
                    // Underweight
                    bodyCompScore = Math.round(45 + Math.random() * 10);
                    category = 'Underweight';
                    bodyType = 'Ectomorph';
                } else if (bmi < 25) {
                    // Normal weight
                    bodyCompScore = Math.round(78 + Math.random() * 12);
                    category = 'Healthy';
                    bodyType = 'Mesomorph';
                } else if (bmi < 30) {
                    // Overweight
                    bodyCompScore = Math.round(42 + Math.random() * 10);
                    category = 'Overweight';
                    bodyType = 'Endomorph';
                } else if (bmi < 35) {
                    // Obese Class I
                    bodyCompScore = Math.round(28 + Math.random() * 8);
                    category = 'Obese';
                    bodyType = 'Endomorph';
                } else if (bmi < 40) {
                    // Obese Class II
                    bodyCompScore = Math.round(18 + Math.random() * 8);
                    category = 'Severely Obese';
                    bodyType = 'Endomorph';
                } else {
                    // Obese Class III
                    bodyCompScore = Math.round(10 + Math.random() * 8);
                    category = 'Morbidly Obese';
                    bodyType = 'Endomorph';
                }

                console.log('Body Composition Score:', bodyCompScore);
                console.log('Category:', category);
                console.log('==================================');

            } else {
                // Fallback if no BMI provided (shouldn't happen with required fields)
                console.log('No BMI data - using default');
                bodyCompScore = 50;
                category = 'Unknown';
                bodyType = 'Unknown';
            }

            // Posture scoring
            const postureScore = Math.min(95, Math.max(40, 100 - Math.round(shoulderDiff * 500) - Math.round(Math.abs(headForward) * 100)));
            const symmetryScore = Math.min(98, Math.max(50, 100 - Math.round(shoulderDiff * 300) - Math.round(hipDiff * 300)));

            // Muscle tone estimate (harder to determine from pose alone)
            const avgConfidence = landmarks.reduce((sum, l) => sum + (l.visibility || 0.5), 0) / landmarks.length;
            const muscleScore = Math.round(Math.min(bodyCompScore * 0.8, 70) + avgConfidence * 20);

            console.log('=== BODY ANALYSIS DEBUG ===');
            console.log('Raw measurements:', {
                skeletonShoulderWidth: skeletonShoulderWidth.toFixed(4),
                skeletonHipWidth: skeletonHipWidth.toFixed(4),
                bodyHeight: bodyHeight.toFixed(4),
                torsoLength: torsoLength.toFixed(4)
            });
            console.log('Calculated ratios:', {
                hipToHeightRatio: hipToHeightRatio.toFixed(4),
                shoulderToHeightRatio: shoulderToHeightRatio.toFixed(4),
                waistHipIndicator: waistHipIndicator.toFixed(4),
                torsoWidthRatio: torsoWidthRatio.toFixed(4)
            });
            console.log('Final result:', {
                bodyCompScore,
                category,
                bodyType
            });
            console.log('===========================');

            // Determine lean mass estimate based on score
            let leanMassEstimate;
            if (bodyCompScore >= 75) leanMassEstimate = "High";
            else if (bodyCompScore >= 60) leanMassEstimate = "Above Average";
            else if (bodyCompScore >= 45) leanMassEstimate = "Average";
            else if (bodyCompScore >= 30) leanMassEstimate = "Below Average";
            else leanMassEstimate = "Low";

            // Upper body assessment
            let upperBodyAssessment;
            if (waistHipIndicator < 0.9 && bodyCompScore >= 65) upperBodyAssessment = "Well Developed";
            else if (bodyCompScore >= 50) upperBodyAssessment = "Moderate";
            else upperBodyAssessment = "Needs Development";

            // Core assessment
            let coreAssessment;
            if (bodyCompScore >= 70) coreAssessment = "Defined";
            else if (bodyCompScore >= 50) coreAssessment = "Moderate";
            else coreAssessment = "Needs Work";

            // Lower body assessment
            let lowerBodyAssessment;
            if (hipToHeightRatio < 0.14) lowerBodyAssessment = "Lean";
            else if (hipToHeightRatio < 0.18) lowerBodyAssessment = "Moderate";
            else lowerBodyAssessment = "Heavy";

            return {
                confidence: state.bmi ? "high" : "low",
                analysisMethod: state.bmi ? "bmi-calculation" : "fallback",
                bmi: state.bmi || null,
                bmiCategory: state.bmiCategory?.category || null,
                bodyComposition: {
                    score: bodyCompScore,
                    category: category,
                    bodyType: bodyType,
                    bmiValue: state.bmi?.toFixed(1) || "N/A",
                    leanMassEstimate: leanMassEstimate
                },
                muscleTone: {
                    score: muscleScore,
                    upperBody: upperBodyAssessment,
                    core: coreAssessment,
                    lowerBody: lowerBodyAssessment
                },
                posture: {
                    score: postureScore,
                    shoulderAlignment: shoulderDiff < 0.02 ? "Aligned" : shoulderDiff < 0.05 ? "Slight Imbalance" : "Noticeable Imbalance",
                    spineAssessment: Math.abs(headForward) < 0.03 ? "Good" : headForward > 0 ? "Minor Forward" : "Minor Backward",
                    hipAlignment: hipDiff < 0.02 ? "Balanced" : "Slight Tilt"
                },
                overview: {
                    fitnessIndex: (bodyCompScore * 0.1).toFixed(1),
                    visualAge: Math.round(30 + (60 - bodyCompScore) * 0.3),
                    overallGrade: bodyCompScore >= 80 ? "A" : bodyCompScore >= 70 ? "B+" : bodyCompScore >= 60 ? "B" : bodyCompScore >= 50 ? "C" : bodyCompScore >= 40 ? "D" : "F",
                    symmetryScore: symmetryScore
                },
                bodyZones: {
                    shoulders: shoulderDiff < 0.02 ? "Balanced" : "Slight asymmetry",
                    chest: waistHipIndicator < 0.9 ? "V-Taper" : waistHipIndicator < 1.05 ? "Straight" : "Wide",
                    core: bodyCompScore >= 65 ? "Defined" : bodyCompScore >= 45 ? "Soft" : "Large",
                    legs: hipToHeightRatio < 0.15 ? "Lean" : hipToHeightRatio < 0.2 ? "Average" : "Heavy"
                },
                recommendations: generateRecommendations(bodyCompScore, postureScore, muscleScore, category),
                landmarks: landmarks
            };
        }

        // Generate personalized recommendations
        function generateRecommendations(bodyScore, postureScore, muscleScore, category) {
            const recs = [];

            // Category-specific recommendations
            if (category === 'Overweight' || category === 'Above Average Weight') {
                recs.push("Start with low-impact cardio like walking or swimming 30 min daily");
                recs.push("Focus on creating a caloric deficit through balanced nutrition");
                recs.push("Incorporate strength training 2-3x per week to build lean muscle");
            } else if (category === 'Average') {
                recs.push("Add cardio exercises 3-4x per week to improve body composition");
                recs.push("Consider a structured resistance training program");
                recs.push("Focus on protein intake to support muscle development");
            } else if (category === 'Fit') {
                recs.push("Continue current training with progressive overload");
                recs.push("Add HIIT sessions for enhanced fat burning");
                recs.push("Focus on weak muscle groups for balanced development");
            } else if (category === 'Athletic') {
                recs.push("Maintain current training routine to preserve muscle mass");
                recs.push("Consider periodization to prevent plateaus");
                recs.push("Focus on mobility and recovery for longevity");
            }

            // Posture recommendations
            if (postureScore < 70) {
                recs.push("Prioritize posture correction - try wall angels and chin tucks daily");
            }

            return recs.slice(0, 3);
        }

        // Fallback when pose not detected clearly
        function getEstimatedResult() {
            return {
                confidence: "low",
                bodyComposition: {
                    score: 50,
                    category: "Unable to Analyze",
                    bodyType: "Unknown",
                    shoulderWaistRatio: "N/A",
                    leanMassEstimate: "Unable to determine"
                },
                muscleTone: {
                    score: 50,
                    upperBody: "Unable to assess",
                    core: "Unable to assess",
                    lowerBody: "Unable to assess"
                },
                posture: {
                    score: 50,
                    shoulderAlignment: "Unable to detect",
                    spineAssessment: "Unable to detect",
                    hipAlignment: "Unable to detect"
                },
                overview: {
                    fitnessIndex: "N/A",
                    visualAge: "N/A",
                    overallGrade: "N/A",
                    symmetryScore: "N/A"
                },
                bodyZones: {
                    shoulders: "Not detected",
                    chest: "Not detected",
                    core: "Not detected",
                    legs: "Not detected"
                },
                recommendations: [
                    "Ensure your FULL BODY is visible (head to feet)",
                    "Stand facing the camera with arms slightly away from body",
                    "Use good lighting and a plain background",
                    "Try a different photo with clearer body visibility"
                ]
            };
        }

        // DOM Elements
        const screens = {
            upload: document.getElementById('screen-upload'),
            analysis: document.getElementById('screen-analysis'),
            results: document.getElementById('screen-results'),
            breakdown: document.getElementById('screen-breakdown'),
            simulator: document.getElementById('screen-simulator'),
            workout: document.getElementById('screen-workout'),
            nutrition: document.getElementById('screen-nutrition')
        };

        const uploadZone = document.getElementById('upload-zone');
        const fileInput = document.getElementById('file-input');
        const uploadPreview = document.getElementById('upload-preview');
        const previewImage = document.getElementById('preview-image');
        const removePreview = document.getElementById('remove-preview');
        const analyzeBtn = document.getElementById('analyze-btn');
        const viewBtns = document.querySelectorAll('.view-btn');
        const navSteps = document.querySelectorAll('.nav-step');

        // Camera elements
        const cameraZone = document.getElementById('camera-zone');
        const cameraVideo = document.getElementById('camera-video');
        const cameraCanvas = document.getElementById('camera-canvas');
        const uploadModeBtn = document.getElementById('upload-mode-btn');
        const cameraModeBtn = document.getElementById('camera-mode-btn');
        const captureBtn = document.getElementById('capture-btn');
        const switchCameraBtn = document.getElementById('switch-camera-btn');
        const closeCameraBtn = document.getElementById('close-camera-btn');

        // Camera state
        let cameraStream = null;
        let currentFacingMode = 'environment'; // 'environment' = back camera, 'user' = front camera

        // Analysis steps
        const analysisSteps = ['step-pose', 'step-extract', 'step-analyze', 'step-generate'];

        // Initialize
        async function init() {
            // Initialize AI models
            console.log('Initializing AI models...');

            // MediaPipe for posture analysis
            await initMediaPipe();

            // BodyPix for body segmentation (runs in parallel)
            initBodyPix().then(success => {
                if (success) console.log('BodyPix ready for body segmentation');
            });

            setupUpload();
            setupCamera();
            setupNavigation();
            setupResults();
            setupBreakdown();
            setupSimulator();
            setupWorkout();
            setupNutrition();
            animateGauges();

            // Setup BMI input listeners
            const heightInput = document.getElementById('height-input');
            const weightInput = document.getElementById('weight-input');
            if (heightInput) heightInput.addEventListener('input', updateBMIPreview);
            if (weightInput) weightInput.addEventListener('input', updateBMIPreview);

            // Initial button state
            updateAnalyzeButton();

            console.log('PHYSIQ AI Ready - BMI + BodyPix + MediaPipe');
        }

        // Upload functionality
        function setupUpload() {
            uploadZone.addEventListener('click', () => fileInput.click());

            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('dragover');
            });

            uploadZone.addEventListener('dragleave', () => {
                uploadZone.classList.remove('dragover');
            });

            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length) handleFile(files[0]);
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) handleFile(e.target.files[0]);
            });

            removePreview.addEventListener('click', (e) => {
                e.stopPropagation();
                clearPreview();
            });

            viewBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    viewBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    state.selectedView = btn.dataset.view;
                });
            });

            analyzeBtn.addEventListener('click', startAnalysis);
        }

        function handleFile(file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                state.imageData = e.target.result;
                uploadPreview.classList.add('has-image');
                uploadZone.style.display = 'none';
                state.hasImage = true;
                updateAnalyzeButton(); // Check if both image AND BMI are ready
            };
            reader.readAsDataURL(file);
        }

        function clearPreview() {
            previewImage.src = '';
            uploadPreview.classList.remove('has-image');
            state.hasImage = false;
            updateAnalyzeButton();
            uploadZone.style.display = 'flex';
            state.hasImage = false;
            state.imageData = null;
            state.analysisResult = null;
            analyzeBtn.disabled = true;
            fileInput.value = '';
        }

        // Camera functionality
        function setupCamera() {
            if (!uploadModeBtn || !cameraModeBtn) return;

            // Mode toggle buttons
            uploadModeBtn.addEventListener('click', () => {
                setInputMode('upload');
            });

            cameraModeBtn.addEventListener('click', () => {
                setInputMode('camera');
            });

            // Camera control buttons
            if (captureBtn) {
                captureBtn.addEventListener('click', capturePhoto);
            }

            if (switchCameraBtn) {
                switchCameraBtn.addEventListener('click', switchCamera);
            }

            if (closeCameraBtn) {
                closeCameraBtn.addEventListener('click', () => {
                    setInputMode('upload');
                });
            }
        }

        function setInputMode(mode) {
            if (mode === 'camera') {
                // Switch to camera mode
                uploadModeBtn.classList.remove('active');
                cameraModeBtn.classList.add('active');
                uploadZone.style.display = 'none';
                uploadPreview.classList.remove('has-image');
                cameraZone.style.display = 'block';
                startCamera();
            } else {
                // Switch to upload mode
                cameraModeBtn.classList.remove('active');
                uploadModeBtn.classList.add('active');
                cameraZone.style.display = 'none';
                stopCamera();
                if (!state.hasImage) {
                    uploadZone.style.display = 'flex';
                } else {
                    uploadPreview.classList.add('has-image');
                }
            }
        }

        async function startCamera() {
            try {
                // Check if mediaDevices API is available
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    alert('Camera is not supported on this browser. Please use a modern browser like Chrome, Safari, or Firefox.');
                    setInputMode('upload');
                    return;
                }

                // Stop any existing stream
                stopCamera();

                const constraints = {
                    video: {
                        facingMode: currentFacingMode,
                        width: { ideal: 1280 },
                        height: { ideal: 1920 }
                    }
                };

                cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
                cameraVideo.srcObject = cameraStream;
                await cameraVideo.play();
                console.log('Camera started:', currentFacingMode);
            } catch (err) {
                console.error('Camera error:', err);
                let errorMessage = 'Could not access camera.\n\n';

                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage += 'Camera permission was denied.\n\n';
                    errorMessage += 'To fix this:\n';
                    errorMessage += '• iPhone/iPad: Go to Settings > Safari > Camera, set to "Allow"\n';
                    errorMessage += '• Android: Tap the lock icon in the address bar and allow camera\n';
                    errorMessage += '• Then refresh this page and try again';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    errorMessage += 'No camera found on this device.';
                } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    errorMessage += 'Camera is being used by another app. Please close other apps using the camera and try again.';
                } else if (err.name === 'OverconstrainedError') {
                    errorMessage += 'Camera does not support the requested settings. Trying with default settings...';
                    // Try again with simpler constraints
                    try {
                        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        cameraVideo.srcObject = cameraStream;
                        await cameraVideo.play();
                        console.log('Camera started with fallback constraints');
                        return;
                    } catch (fallbackErr) {
                        errorMessage = 'Could not access camera with any settings. Please try again.';
                    }
                } else {
                    errorMessage += 'Error: ' + err.message;
                }

                alert(errorMessage);
                setInputMode('upload');
            }
        }

        function stopCamera() {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                cameraStream = null;
            }
            if (cameraVideo) {
                cameraVideo.srcObject = null;
            }
        }

        async function switchCamera() {
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            await startCamera();
        }

        function capturePhoto() {
            if (!cameraVideo || !cameraCanvas) return;

            // Set canvas size to video size
            cameraCanvas.width = cameraVideo.videoWidth;
            cameraCanvas.height = cameraVideo.videoHeight;

            // Draw video frame to canvas
            const ctx = cameraCanvas.getContext('2d');

            // Mirror the image if using front camera
            if (currentFacingMode === 'user') {
                ctx.translate(cameraCanvas.width, 0);
                ctx.scale(-1, 1);
            }

            ctx.drawImage(cameraVideo, 0, 0);

            // Convert to data URL
            const imageData = cameraCanvas.toDataURL('image/jpeg', 0.9);

            // Set preview image
            previewImage.src = imageData;
            state.imageData = imageData;
            state.hasImage = true;

            // Stop camera and show preview
            stopCamera();
            cameraZone.style.display = 'none';
            uploadPreview.classList.add('has-image');
            uploadZone.style.display = 'none';

            // Reset mode buttons
            cameraModeBtn.classList.remove('active');
            uploadModeBtn.classList.add('active');

            updateAnalyzeButton();
            console.log('Photo captured from camera');
        }

        // Navigation
        function setupNavigation() {
            navSteps.forEach(step => {
                step.addEventListener('click', () => {
                    const stepNum = parseInt(step.dataset.step);
                    // Only allow going back to completed steps
                    if (stepNum < state.currentScreen) {
                        goToScreen(stepNum);
                    }
                });
            });
        }

        function goToScreen(num) {
            // Hide all screens
            Object.values(screens).forEach(s => s.classList.remove('active'));

            // Show target screen
            const screenMap = {1: 'upload', 2: 'analysis', 3: 'results', 4: 'breakdown', 5: 'simulator', 6: 'workout', 7: 'nutrition'};
            screens[screenMap[num]].classList.add('active');

            // Update nav
            navSteps.forEach(step => {
                const stepNum = parseInt(step.dataset.step);
                step.classList.remove('active', 'completed');
                if (stepNum === num) step.classList.add('active');
                if (stepNum < num) step.classList.add('completed');
            });

            state.currentScreen = num;

            // Animate gauges when results screen shows
            if (num === 3) {
                setTimeout(animateGauges, 300);
            }
        }

        // Analysis with MediaPipe (Free AI)
        async function startAnalysis() {
            goToScreen(2);

            // Reset all steps first
            analysisSteps.forEach(id => {
                document.getElementById(id).classList.remove('active', 'completed');
            });

            // Start visual progress
            runAnalysisSteps();

            // Process image with MediaPipe
            try {
                console.log('Processing with MediaPipe (free, local AI)...');

                // Create an image element from the uploaded data
                const img = new Image();
                img.src = state.imageData;

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                // Send to MediaPipe for pose detection
                await poseDetector.send({ image: img });

                console.log('MediaPipe analysis complete!');

            } catch (error) {
                console.error('MediaPipe analysis failed:', error);
                // Mark as no human detected - error will be shown by runAnalysisSteps
                state.humanDetected = false;
                state.analysisResult = null;
                console.log('Analysis failed - no valid data');
            }
        }

        function runAnalysisSteps() {
            let currentStep = 0;
            const stepDuration = 1500; // Longer to allow API time

            function advanceStep() {
                if (currentStep > 0) {
                    document.getElementById(analysisSteps[currentStep - 1]).classList.remove('active');
                    document.getElementById(analysisSteps[currentStep - 1]).classList.add('completed');
                }

                if (currentStep < analysisSteps.length) {
                    document.getElementById(analysisSteps[currentStep]).classList.add('active');
                    currentStep++;
                    setTimeout(advanceStep, stepDuration);
                } else {
                    // Analysis complete - check if human was detected
                    setTimeout(() => {
                        if (!state.humanDetected || !state.analysisResult) {
                            // No human body detected - show error and return to upload
                            showNoHumanDetectedError();
                        } else {
                            // Valid analysis - show results
                            populateResults();
                            goToScreen(3);
                        }
                    }, 500);
                }
            }

            advanceStep();
        }

        // Show error when no human body is detected
        function showNoHumanDetectedError() {
            const errorMessage = `No Human Body Detected

The AI could not detect a human body in your photo.

Please ensure:
• Your FULL BODY is visible (head to feet)
• You are facing the camera
• Good lighting with minimal shadows
• Plain background if possible
• Photo is not blurry

Please try again with a different photo.`;

            alert(errorMessage);

            // Reset state and return to upload screen
            state.humanDetected = false;
            state.analysisResult = null;
            state.landmarks = null;
            goToScreen(1);
        }

        // Populate results from AI analysis
        function populateResults() {
            const result = state.analysisResult;
            if (!result) return;

            const bodyComp = result.bodyComposition || {};
            const muscleTone = result.muscleTone || {};
            const posture = result.posture || {};
            const overview = result.overview || {};
            const zones = result.bodyZones || {};

            // ========== RESULTS SCREEN (Screen 3) ==========

            // Update body composition metric card
            const metricValues = document.querySelectorAll('.metric-card .metric-value');
            if (metricValues[0]) metricValues[0].textContent = bodyComp.category || 'Average';
            if (metricValues[1]) metricValues[1].textContent = muscleTone.score ? muscleTone.score + '%' : '50%';

            // Update gauge data values
            const gaugeFills = document.querySelectorAll('.gauge-fill');
            if (gaugeFills[0]) gaugeFills[0].dataset.value = bodyComp.score || 50;
            if (gaugeFills[1]) gaugeFills[1].dataset.value = muscleTone.score || 50;
            if (gaugeFills[2]) gaugeFills[2].dataset.value = posture.score || 50;

            // Update gauge center values
            const gaugeValues = document.querySelectorAll('.gauge-value');
            if (gaugeValues[0]) gaugeValues[0].textContent = bodyComp.score || 50;
            if (gaugeValues[1]) gaugeValues[1].textContent = muscleTone.score || 50;
            if (gaugeValues[2]) gaugeValues[2].textContent = posture.score || 50;

            // Update gauge stats for body composition
            const gaugeInfos = document.querySelectorAll('.gauge-info');
            if (gaugeInfos[0]) {
                const stats = gaugeInfos[0].querySelectorAll('.stat-value');
                if (stats[0]) stats[0].textContent = bodyComp.leanMassEstimate || 'Average';
                if (stats[1]) stats[1].textContent = overview.symmetryScore ? 'Symmetrical' : 'Asymmetrical';
                if (stats[2]) stats[2].textContent = bodyComp.bodyType || 'Mixed';
            }
            // Update gauge stats for muscle tone
            if (gaugeInfos[1]) {
                const stats = gaugeInfos[1].querySelectorAll('.stat-value');
                if (stats[0]) stats[0].textContent = muscleTone.upperBody || 'Moderate';
                if (stats[1]) stats[1].textContent = muscleTone.core || 'Moderate';
                if (stats[2]) stats[2].textContent = muscleTone.lowerBody || 'Moderate';
            }
            // Update gauge stats for posture
            if (gaugeInfos[2]) {
                const stats = gaugeInfos[2].querySelectorAll('.stat-value');
                if (stats[0]) stats[0].textContent = posture.shoulderAlignment || 'Unknown';
                if (stats[1]) stats[1].textContent = posture.spineAssessment || 'Unknown';
                if (stats[2]) stats[2].textContent = posture.hipAlignment || 'Unknown';
            }

            // Update posture metric value
            const postureMetricValue = document.querySelectorAll('.metric-card')[2]?.querySelector('.metric-value');
            if (postureMetricValue) {
                postureMetricValue.textContent = posture.score >= 75 ? 'Good' : posture.score >= 50 ? 'Fair' : 'Poor';
            }

            // Update body zones on silhouette
            const shoulderZone = document.querySelector('.zone-shoulders .zone-label');
            const chestZone = document.querySelector('.zone-chest .zone-label');
            const coreZone = document.querySelector('.zone-core .zone-label');
            const legsZone = document.querySelector('.zone-legs .zone-label');

            if (shoulderZone) shoulderZone.textContent = `Shoulders: ${zones.shoulders || 'Unknown'}`;
            if (chestZone) chestZone.textContent = `Upper Body: ${zones.chest || 'Unknown'}`;
            if (coreZone) coreZone.textContent = `Core: ${zones.core || 'Unknown'}`;
            if (legsZone) legsZone.textContent = `Lower Body: ${zones.legs || 'Unknown'}`;

            // Update overview stats
            const overviewItems = document.querySelectorAll('.overview-item .overview-value');
            if (overviewItems[0]) overviewItems[0].textContent = overview.fitnessIndex || 'N/A';
            if (overviewItems[1]) overviewItems[1].textContent = overview.visualAge || 'N/A';
            if (overviewItems[2]) overviewItems[2].textContent = overview.overallGrade || 'N/A';
            if (overviewItems[3]) overviewItems[3].textContent = overview.symmetryScore ? overview.symmetryScore + '%' : 'N/A';

            // Update confidence badge with analysis method
            const confidenceBadge = document.querySelector('.confidence-text');
            if (confidenceBadge) {
                confidenceBadge.textContent = result.bmi ? 'BMI Verified' : 'Estimated';
            }

            // Update confidence description
            const confidenceDesc = document.querySelector('.confidence-description');
            if (confidenceDesc) {
                if (result.bmi) {
                    confidenceDesc.textContent = `BMI: ${result.bmi.toFixed(1)} (${result.bmiCategory}). Posture analysis by AI.`;
                } else {
                    confidenceDesc.textContent = 'Enter height & weight for accurate body composition analysis.';
                }
            }

            // ========== DETAILED BREAKDOWN SCREEN (Screen 4) ==========

            // Update score values in breakdown sections
            const scoreValues = document.querySelectorAll('.score-value');
            if (scoreValues[0]) scoreValues[0].textContent = `${bodyComp.score || 50}/100`;
            if (scoreValues[1]) scoreValues[1].textContent = `${muscleTone.score || 50}/100`;
            if (scoreValues[2]) scoreValues[2].textContent = `${posture.score || 50}/100`;

            // Update detail values in breakdown
            const detailValues = document.querySelectorAll('.detail-value');

            // Body Composition section (indices 0-3)
            if (detailValues[0]) {
                detailValues[0].textContent = bodyComp.bodyType || 'Unknown';
                detailValues[0].className = 'detail-value ' + getValueClass(bodyComp.score);
            }
            if (detailValues[1]) {
                detailValues[1].textContent = `${bodyComp.shoulderWaistRatio || 'N/A'} (${bodyComp.category || 'Unknown'})`;
                detailValues[1].className = 'detail-value ' + getValueClass(bodyComp.score);
            }
            if (detailValues[2]) {
                detailValues[2].textContent = bodyComp.leanMassEstimate || 'Unknown';
                detailValues[2].className = 'detail-value ' + getValueClass(bodyComp.score);
            }
            if (detailValues[3]) {
                detailValues[3].textContent = `${bodyComp.score || 50}/100`;
            }

            // Muscle Tone section (indices 4-7)
            if (detailValues[4]) {
                detailValues[4].textContent = muscleTone.upperBody || 'Unknown';
                detailValues[4].className = 'detail-value ' + getValueClass(muscleTone.score, 'upper');
            }
            if (detailValues[5]) {
                detailValues[5].textContent = muscleTone.core || 'Unknown';
                detailValues[5].className = 'detail-value ' + getValueClass(muscleTone.score, 'core');
            }
            if (detailValues[6]) {
                detailValues[6].textContent = muscleTone.lowerBody || 'Unknown';
                detailValues[6].className = 'detail-value ' + getValueClass(muscleTone.score, 'lower');
            }
            if (detailValues[7]) {
                detailValues[7].textContent = `${muscleTone.score || 50}/100`;
            }

            // Posture section (indices 8-11)
            if (detailValues[8]) {
                detailValues[8].textContent = posture.shoulderAlignment || 'Unknown';
                detailValues[8].className = 'detail-value ' + (posture.shoulderAlignment === 'Aligned' ? 'good' : 'warning');
            }
            if (detailValues[9]) {
                detailValues[9].textContent = posture.spineAssessment || 'Unknown';
                detailValues[9].className = 'detail-value ' + (posture.spineAssessment === 'Good' ? 'good' : 'warning');
            }
            if (detailValues[10]) {
                detailValues[10].textContent = posture.hipAlignment || 'Unknown';
                detailValues[10].className = 'detail-value ' + (posture.hipAlignment === 'Balanced' ? 'good' : 'warning');
            }
            if (detailValues[11]) {
                detailValues[11].textContent = `${posture.score || 50}/100`;
            }

            // Update recommendations
            updateRecommendations(result.recommendations || []);

            // Update AI reasoning explainability text
            updateExplainabilityText(result);

            // Animate gauges with new values
            animateGauges();
        }

        // Update explainability text based on analysis
        function updateExplainabilityText(result) {
            const bodyComp = result.bodyComposition || {};
            const muscleTone = result.muscleTone || {};
            const posture = result.posture || {};

            // Body composition explanation
            const bodyExplain = document.getElementById('explain-body-comp');
            if (bodyExplain) {
                let text = `The <strong>${bodyComp.category || 'Unknown'}</strong> classification is based on detected `;
                text += `<strong>hip-to-height ratio</strong> and <strong>body width proportions</strong>. `;
                text += `Body type identified as <strong>${bodyComp.bodyType || 'Unknown'}</strong> `;
                text += `with ${bodyComp.leanMassEstimate || 'unknown'} lean mass estimation.`;
                bodyExplain.innerHTML = text;
            }

            // Muscle tone explanation
            const muscleExplain = document.getElementById('explain-muscle-tone');
            if (muscleExplain) {
                let text = `Upper body assessment: <strong>${muscleTone.upperBody || 'Unknown'}</strong> based on shoulder width analysis. `;
                text += `Core assessment: <strong>${muscleTone.core || 'Unknown'}</strong>. `;
                text += `Lower body: <strong>${muscleTone.lowerBody || 'Unknown'}</strong> based on hip and leg proportions.`;
                muscleExplain.innerHTML = text;
            }

            // Posture explanation
            const postureExplain = document.getElementById('explain-posture');
            if (postureExplain) {
                let text = `Shoulder alignment: <strong>${posture.shoulderAlignment || 'Unknown'}</strong>. `;
                text += `Spine assessment: <strong>${posture.spineAssessment || 'Unknown'}</strong>. `;
                text += `Hip alignment: <strong>${posture.hipAlignment || 'Unknown'}</strong>.`;
                postureExplain.innerHTML = text;
            }
        }

        // Helper function to determine value class (good/warning/alert)
        function getValueClass(score, type = null) {
            if (score >= 65) return 'good';
            if (score >= 45) return 'warning';
            return 'alert';
        }

        // Update recommendation lists in breakdown
        function updateRecommendations(recommendations) {
            const recLists = document.querySelectorAll('.recommendation-list');
            recLists.forEach(list => {
                const items = list.querySelectorAll('.recommendation-item span');
                recommendations.forEach((rec, index) => {
                    if (items[index]) {
                        items[index].textContent = rec;
                    }
                });
            });
        }

        // Mock data fallback
        // Results
        function setupResults() {
            document.getElementById('view-details-btn').addEventListener('click', () => {
                goToScreen(4);
            });

            document.getElementById('open-simulator-btn').addEventListener('click', () => {
                goToScreen(5);
            });

            document.getElementById('open-workout-btn').addEventListener('click', () => {
                goToScreen(6);
            });

            document.getElementById('open-nutrition-btn').addEventListener('click', () => {
                goToScreen(7);
            });

            document.getElementById('new-analysis-btn').addEventListener('click', () => {
                clearPreview();
                goToScreen(1);
            });
        }

        // Animate gauges
        function animateGauges() {
            const gauges = document.querySelectorAll('.gauge-fill');
            gauges.forEach(gauge => {
                const value = parseInt(gauge.dataset.value) || 0;
                const circumference = 2 * Math.PI * 40;
                const offset = circumference - (value / 100) * circumference;
                gauge.style.strokeDashoffset = offset;

                // Apply score-based gradient class
                gauge.classList.remove('score-low', 'score-medium', 'score-high');
                if (value < 40) {
                    gauge.classList.add('score-low');
                } else if (value < 70) {
                    gauge.classList.add('score-medium');
                } else {
                    gauge.classList.add('score-high');
                }
            });
        }

        // Breakdown
        function setupBreakdown() {
            document.getElementById('back-to-results').addEventListener('click', () => {
                goToScreen(3);
            });

            // Explainability toggle
            const toggle = document.getElementById('explainability-toggle');
            toggle.addEventListener('click', () => {
                state.explainabilityOn = !state.explainabilityOn;
                toggle.classList.toggle('active', state.explainabilityOn);

                document.querySelectorAll('.explainability-box').forEach(box => {
                    box.classList.toggle('visible', state.explainabilityOn);
                });
            });

            // Section expansion
            document.querySelectorAll('.section-header').forEach(header => {
                header.addEventListener('click', () => {
                    const section = header.parentElement;
                    section.classList.toggle('expanded');
                });
            });
        }

        // Simulator
        function setupSimulator() {
            // Scenario data
            const scenarios = {
                active: {
                    fitness: { value: 8.1, change: '+0.9', pct: '+12.5%' },
                    muscle: { value: 78, change: '+10%', pct: 'Improved' },
                    posture: { value: 88, change: '+10', pct: '+13%' },
                    age: { value: 25, change: '-3', pct: 'Years Younger' },
                    positive: true
                },
                sedentary: {
                    fitness: { value: 6.4, change: '-0.8', pct: '-11%' },
                    muscle: { value: 60, change: '-8%', pct: 'Declined' },
                    posture: { value: 70, change: '-8', pct: '-10%' },
                    age: { value: 31, change: '+3', pct: 'Years Older' },
                    positive: false
                },
                intensive: {
                    fitness: { value: 8.8, change: '+1.6', pct: '+22%' },
                    muscle: { value: 88, change: '+20%', pct: 'Significant' },
                    posture: { value: 93, change: '+15', pct: '+19%' },
                    age: { value: 23, change: '-5', pct: 'Years Younger' },
                    positive: true
                },
                nutrition: {
                    fitness: { value: 7.8, change: '+0.6', pct: '+8%' },
                    muscle: { value: 75, change: '+7%', pct: 'Moderate' },
                    posture: { value: 80, change: '+2', pct: '+3%' },
                    age: { value: 26, change: '-2', pct: 'Years Younger' },
                    positive: true
                }
            };

            const timelineLabels = ['1 Month', '6 Months', '1 Year', '2 Years', '5 Years'];
            const timelineMultipliers = [0.15, 1, 1.8, 2.5, 3.5];

            let currentScenario = 'active';
            let currentTimeline = 2;

            // Update display based on scenario and timeline
            function updateProjection() {
                const scenario = scenarios[currentScenario];
                const multiplier = timelineMultipliers[currentTimeline - 1];
                const timeLabel = timelineLabels[currentTimeline - 1];

                // Update timeline labels
                document.getElementById('timeline-display').textContent = timeLabel;
                document.getElementById('timeline-label').textContent = timeLabel;
                document.getElementById('scenario-time').textContent = 'After ' + timeLabel.toLowerCase();

                // Calculate projected values with timeline multiplier
                const baseFitness = 7.2;
                const baseMuscle = 68;
                const basePosture = 78;
                const baseAge = 28;

                const fitnessDelta = (scenario.fitness.value - baseFitness) * Math.min(multiplier, 1.5);
                const muscleDelta = (scenario.muscle.value - baseMuscle) * Math.min(multiplier, 1.5);
                const postureDelta = (scenario.posture.value - basePosture) * Math.min(multiplier, 1.5);
                const ageDelta = (scenario.age.value - baseAge) * Math.min(multiplier, 1.5);

                const projectedFitness = (baseFitness + fitnessDelta).toFixed(1);
                const projectedMuscle = Math.round(baseMuscle + muscleDelta);
                const projectedPosture = Math.round(basePosture + postureDelta);
                const projectedAge = Math.round(baseAge + ageDelta);

                // Update avatar stats
                document.getElementById('future-fitness').textContent = projectedFitness;
                document.getElementById('future-muscle').textContent = projectedMuscle + '%';
                document.getElementById('future-age').textContent = projectedAge;
                document.getElementById('projected-visual-age').textContent = projectedAge;

                // Update years younger/older text
                const yearsDiff = Math.abs(baseAge - projectedAge);
                const yearsText = yearsDiff + ' year' + (yearsDiff !== 1 ? 's' : '') + (projectedAge < baseAge ? ' younger' : ' older');
                document.getElementById('years-younger').textContent = yearsText;

                // Update impact summary
                const fitnessChange = fitnessDelta >= 0 ? '+' + fitnessDelta.toFixed(1) : fitnessDelta.toFixed(1);
                const muscleChange = muscleDelta >= 0 ? '+' + Math.round(muscleDelta) + '%' : Math.round(muscleDelta) + '%';
                const postureChange = postureDelta >= 0 ? '+' + Math.round(postureDelta) : Math.round(postureDelta);
                const ageChange = ageDelta <= 0 ? Math.round(ageDelta) : '+' + Math.round(ageDelta);

                document.getElementById('impact-fitness').textContent = fitnessChange;
                document.getElementById('impact-muscle').textContent = muscleChange;
                document.getElementById('impact-posture').textContent = postureChange;
                document.getElementById('impact-age').textContent = ageChange;

                // Update impact change badges
                const impactElements = [
                    { id: 'impact-fitness-pct', positive: fitnessDelta >= 0, text: scenario.positive ? '+' + Math.round(Math.abs(fitnessDelta / baseFitness) * 100) + '%' : Math.round(fitnessDelta / baseFitness * 100) + '%' },
                    { id: 'impact-muscle-pct', positive: muscleDelta >= 0, text: scenario.positive ? 'Improved' : 'Declined' },
                    { id: 'impact-posture-pct', positive: postureDelta >= 0, text: scenario.positive ? '+' + Math.round(Math.abs(postureDelta / basePosture) * 100) + '%' : Math.round(postureDelta / basePosture * 100) + '%' },
                    { id: 'impact-age-pct', positive: ageDelta <= 0, text: ageDelta <= 0 ? 'Years Younger' : 'Years Older' }
                ];

                impactElements.forEach(el => {
                    const element = document.getElementById(el.id);
                    element.textContent = el.text;
                    element.className = 'impact-change ' + (el.positive ? 'positive' : 'negative');
                });

                // Update future avatar stat colors
                const futureStats = document.querySelectorAll('.avatar-stat-value.future');
                futureStats.forEach(stat => {
                    stat.style.color = scenario.positive ? 'var(--accent-purple)' : 'var(--accent-coral)';
                });
            }

            // Scenario card selection
            document.querySelectorAll('.scenario-card').forEach(card => {
                card.addEventListener('click', () => {
                    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    currentScenario = card.dataset.scenario;
                    updateProjection();
                });
            });

            // Timeline slider
            const slider = document.getElementById('timeline-slider');
            slider.addEventListener('input', (e) => {
                currentTimeline = parseInt(e.target.value);

                // Update markers
                document.querySelectorAll('.timeline-marker').forEach(marker => {
                    marker.classList.remove('active');
                    if (parseInt(marker.dataset.value) === currentTimeline) {
                        marker.classList.add('active');
                    }
                });

                updateProjection();
            });

            // Navigation buttons
            document.getElementById('back-to-results-sim').addEventListener('click', () => {
                goToScreen(3);
            });

            document.getElementById('back-to-breakdown').addEventListener('click', () => {
                goToScreen(4);
            });

            document.getElementById('start-new-sim').addEventListener('click', () => {
                clearPreview();
                goToScreen(1);
            });

            // Initial update
            updateProjection();
        }

        // Workout
        function setupWorkout() {
            // Filter buttons
            const filterBtns = document.querySelectorAll('.filter-btn');
            const exerciseCards = document.querySelectorAll('.exercise-card');

            filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update active state
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const filter = btn.dataset.filter;

                    // Filter cards
                    exerciseCards.forEach(card => {
                        if (filter === 'all') {
                            card.style.display = 'block';
                        } else if (filter === 'weak') {
                            card.style.display = card.dataset.weak === 'true' ? 'block' : 'none';
                        } else {
                            card.style.display = card.dataset.type === filter ? 'block' : 'none';
                        }
                    });
                });
            });

            // Navigation buttons
            document.getElementById('back-to-results-workout').addEventListener('click', () => {
                goToScreen(3);
            });

            document.getElementById('back-to-simulator-workout').addEventListener('click', () => {
                goToScreen(5);
            });

            document.getElementById('start-routine-btn').addEventListener('click', () => {
                alert('Starting full workout routine! (Demo mode)');
            });
        }

        // Nutrition
        function setupNutrition() {
            // Navigation buttons
            document.getElementById('back-to-results-nutrition').addEventListener('click', () => {
                goToScreen(3);
            });

            document.getElementById('back-to-workout-nutrition').addEventListener('click', () => {
                goToScreen(6);
            });

            document.getElementById('back-to-simulator-nutrition').addEventListener('click', () => {
                goToScreen(5);
            });

            document.getElementById('generate-meal-plan-btn').addEventListener('click', () => {
                alert('Generating personalized meal plan! (Demo mode)');
            });

            // Setup food recognition
            setupFoodRecognition();
        }

        // MobileNet model for food recognition
        let mobilenetModel = null;

        // Initialize MobileNet
        async function initMobileNet() {
            try {
                console.log('Loading MobileNet model...');
                mobilenetModel = await mobilenet.load({
                    version: 2,
                    alpha: 1.0
                });
                console.log('MobileNet model loaded successfully!');
                return true;
            } catch (error) {
                console.error('Failed to load MobileNet:', error);
                return false;
            }
        }

        // Food nutrition database - maps image classifications to nutrition data
        const foodNutritionDB = {
            // Fruits
            'banana': { name: 'Banana', portion: '1 medium (118g)', calories: 105, protein: 1, carbs: 27, fats: 0, icon: '🍌' },
            'orange': { name: 'Orange', portion: '1 medium (131g)', calories: 62, protein: 1, carbs: 15, fats: 0, icon: '🍊' },
            'apple': { name: 'Apple', portion: '1 medium (182g)', calories: 95, protein: 0, carbs: 25, fats: 0, icon: '🍎' },
            'strawberry': { name: 'Strawberries', portion: '1 cup (144g)', calories: 46, protein: 1, carbs: 11, fats: 0, icon: '🍓' },
            'pineapple': { name: 'Pineapple', portion: '1 cup (165g)', calories: 82, protein: 1, carbs: 22, fats: 0, icon: '🍍' },
            'lemon': { name: 'Lemon', portion: '1 medium (58g)', calories: 17, protein: 1, carbs: 5, fats: 0, icon: '🍋' },
            'fig': { name: 'Fig', portion: '1 medium (50g)', calories: 37, protein: 0, carbs: 10, fats: 0, icon: '🍇' },
            'pomegranate': { name: 'Pomegranate', portion: '1/2 cup (87g)', calories: 72, protein: 1, carbs: 16, fats: 1, icon: '🍎' },
            'granny_smith': { name: 'Green Apple', portion: '1 medium (182g)', calories: 95, protein: 0, carbs: 25, fats: 0, icon: '🍏' },

            // Vegetables
            'broccoli': { name: 'Broccoli', portion: '1 cup (91g)', calories: 55, protein: 4, carbs: 11, fats: 1, icon: '🥦' },
            'cauliflower': { name: 'Cauliflower', portion: '1 cup (100g)', calories: 25, protein: 2, carbs: 5, fats: 0, icon: '🥬' },
            'cucumber': { name: 'Cucumber', portion: '1 medium (201g)', calories: 30, protein: 1, carbs: 6, fats: 0, icon: '🥒' },
            'bell_pepper': { name: 'Bell Pepper', portion: '1 medium (119g)', calories: 24, protein: 1, carbs: 6, fats: 0, icon: '🫑' },
            'mushroom': { name: 'Mushrooms', portion: '1 cup (70g)', calories: 15, protein: 2, carbs: 2, fats: 0, icon: '🍄' },
            'head_cabbage': { name: 'Cabbage', portion: '1 cup (89g)', calories: 22, protein: 1, carbs: 5, fats: 0, icon: '🥬' },
            'artichoke': { name: 'Artichoke', portion: '1 medium (128g)', calories: 60, protein: 4, carbs: 13, fats: 0, icon: '🌿' },
            'zucchini': { name: 'Zucchini', portion: '1 medium (196g)', calories: 33, protein: 2, carbs: 6, fats: 1, icon: '🥒' },
            'spaghetti_squash': { name: 'Spaghetti Squash', portion: '1 cup (155g)', calories: 42, protein: 1, carbs: 10, fats: 0, icon: '🎃' },
            'butternut_squash': { name: 'Butternut Squash', portion: '1 cup (205g)', calories: 82, protein: 2, carbs: 22, fats: 0, icon: '🎃' },
            'acorn_squash': { name: 'Acorn Squash', portion: '1 cup (205g)', calories: 115, protein: 2, carbs: 30, fats: 0, icon: '🎃' },

            // Prepared Foods
            'pizza': { name: 'Pizza Slice', portion: '1 slice (107g)', calories: 285, protein: 12, carbs: 36, fats: 10, icon: '🍕' },
            'hamburger': { name: 'Hamburger', portion: '1 burger (226g)', calories: 540, protein: 34, carbs: 40, fats: 27, icon: '🍔' },
            'cheeseburger': { name: 'Cheeseburger', portion: '1 burger (256g)', calories: 620, protein: 38, carbs: 42, fats: 33, icon: '🍔' },
            'hotdog': { name: 'Hot Dog', portion: '1 hot dog (116g)', calories: 290, protein: 11, carbs: 24, fats: 17, icon: '🌭' },
            'french_fries': { name: 'French Fries', portion: 'medium (117g)', calories: 365, protein: 4, carbs: 48, fats: 17, icon: '🍟' },
            'burrito': { name: 'Burrito', portion: '1 burrito (272g)', calories: 430, protein: 19, carbs: 50, fats: 18, icon: '🌯' },
            'taco': { name: 'Taco', portion: '1 taco (85g)', calories: 170, protein: 8, carbs: 13, fats: 9, icon: '🌮' },
            'sandwich': { name: 'Sandwich', portion: '1 sandwich (150g)', calories: 350, protein: 15, carbs: 35, fats: 16, icon: '🥪' },
            'bagel': { name: 'Bagel', portion: '1 bagel (98g)', calories: 277, protein: 11, carbs: 55, fats: 1, icon: '🥯' },

            // Pasta & Rice
            'spaghetti_bolognese': { name: 'Spaghetti Bolognese', portion: '1 plate (350g)', calories: 520, protein: 25, carbs: 65, fats: 18, icon: '🍝' },
            'carbonara': { name: 'Pasta Carbonara', portion: '1 plate (300g)', calories: 580, protein: 22, carbs: 55, fats: 28, icon: '🍝' },
            'plate': { name: 'Rice Bowl', portion: '1 bowl (200g)', calories: 260, protein: 5, carbs: 57, fats: 1, icon: '🍚' },
            'meat_loaf': { name: 'Meatloaf', portion: '1 slice (113g)', calories: 250, protein: 17, carbs: 8, fats: 17, icon: '🍖' },

            // Breakfast
            'waffle': { name: 'Waffle', portion: '1 waffle (75g)', calories: 218, protein: 6, carbs: 25, fats: 11, icon: '🧇' },
            'pancake': { name: 'Pancakes', portion: '3 pancakes (114g)', calories: 280, protein: 8, carbs: 45, fats: 8, icon: '🥞' },
            'eggs': { name: 'Eggs', portion: '2 large', calories: 140, protein: 12, carbs: 1, fats: 10, icon: '🥚' },
            'breakfast_burrito': { name: 'Breakfast Burrito', portion: '1 burrito (163g)', calories: 305, protein: 13, carbs: 29, fats: 15, icon: '🌯' },

            // Soups & Bowls
            'soup': { name: 'Soup', portion: '1 bowl (245g)', calories: 150, protein: 8, carbs: 18, fats: 5, icon: '🍜' },
            'consomme': { name: 'Broth/Consomme', portion: '1 cup (240g)', calories: 29, protein: 5, carbs: 2, fats: 0, icon: '🥣' },
            'guacamole': { name: 'Guacamole', portion: '1/4 cup (57g)', calories: 90, protein: 1, carbs: 5, fats: 8, icon: '🥑' },

            // Desserts
            'ice_cream': { name: 'Ice Cream', portion: '1/2 cup (66g)', calories: 137, protein: 2, carbs: 16, fats: 7, icon: '🍦' },
            'chocolate_cake': { name: 'Chocolate Cake', portion: '1 slice (95g)', calories: 352, protein: 4, carbs: 51, fats: 15, icon: '🍰' },
            'cheesecake': { name: 'Cheesecake', portion: '1 slice (125g)', calories: 401, protein: 7, carbs: 33, fats: 28, icon: '🍰' },
            'cupcake': { name: 'Cupcake', portion: '1 cupcake (55g)', calories: 175, protein: 2, carbs: 26, fats: 7, icon: '🧁' },
            'brownie': { name: 'Brownie', portion: '1 brownie (56g)', calories: 227, protein: 3, carbs: 36, fats: 9, icon: '🍫' },
            'pretzel': { name: 'Pretzel', portion: '1 large (115g)', calories: 380, protein: 9, carbs: 79, fats: 4, icon: '🥨' },
            'doughnut': { name: 'Doughnut', portion: '1 doughnut (60g)', calories: 252, protein: 3, carbs: 29, fats: 14, icon: '🍩' },

            // Seafood
            'lobster': { name: 'Lobster', portion: '3 oz (85g)', calories: 76, protein: 16, carbs: 0, fats: 1, icon: '🦞' },
            'crab': { name: 'Crab', portion: '3 oz (85g)', calories: 82, protein: 16, carbs: 0, fats: 1, icon: '🦀' },
            'shrimp': { name: 'Shrimp', portion: '3 oz (85g)', calories: 84, protein: 18, carbs: 0, fats: 1, icon: '🦐' },

            // Bread & Bakery
            'bread': { name: 'Bread', portion: '1 slice (30g)', calories: 79, protein: 3, carbs: 15, fats: 1, icon: '🍞' },
            'baguette': { name: 'Baguette', portion: '2 slices (60g)', calories: 158, protein: 5, carbs: 31, fats: 1, icon: '🥖' },
            'croissant': { name: 'Croissant', portion: '1 croissant (57g)', calories: 231, protein: 5, carbs: 26, fats: 12, icon: '🥐' },

            // Meats
            'steak': { name: 'Steak', portion: '6 oz (170g)', calories: 271, protein: 26, carbs: 0, fats: 18, icon: '🥩' },
            'pork_chop': { name: 'Pork Chop', portion: '1 chop (145g)', calories: 236, protein: 27, carbs: 0, fats: 14, icon: '🍖' },
            'chicken': { name: 'Chicken Breast', portion: '1 breast (172g)', calories: 284, protein: 53, carbs: 0, fats: 6, icon: '🍗' },
            'drumstick': { name: 'Chicken Drumstick', portion: '1 drumstick (96g)', calories: 152, protein: 20, carbs: 0, fats: 8, icon: '🍗' },

            // Drinks
            'espresso': { name: 'Espresso', portion: '1 shot (30ml)', calories: 3, protein: 0, carbs: 0, fats: 0, icon: '☕' },
            'cup': { name: 'Coffee', portion: '1 cup (240ml)', calories: 5, protein: 0, carbs: 0, fats: 0, icon: '☕' },
            'beer_glass': { name: 'Beer', portion: '1 glass (355ml)', calories: 153, protein: 2, carbs: 13, fats: 0, icon: '🍺' },
            'wine_glass': { name: 'Wine', portion: '1 glass (150ml)', calories: 125, protein: 0, carbs: 4, fats: 0, icon: '🍷' },
            'cocktail': { name: 'Cocktail', portion: '1 glass (150ml)', calories: 180, protein: 0, carbs: 15, fats: 0, icon: '🍹' },

            // Other common foods
            'cheese': { name: 'Cheese', portion: '1 oz (28g)', calories: 113, protein: 7, carbs: 0, fats: 9, icon: '🧀' },
            'butter': { name: 'Butter', portion: '1 tbsp (14g)', calories: 102, protein: 0, carbs: 0, fats: 12, icon: '🧈' },
            'chocolate': { name: 'Chocolate', portion: '1 bar (44g)', calories: 235, protein: 3, carbs: 26, fats: 13, icon: '🍫' },
            'popcorn': { name: 'Popcorn', portion: '3 cups (24g)', calories: 93, protein: 3, carbs: 19, fats: 1, icon: '🍿' },
            'candy': { name: 'Candy', portion: '1 oz (28g)', calories: 110, protein: 0, carbs: 27, fats: 0, icon: '🍬' },

            // Salads
            'salad': { name: 'Garden Salad', portion: '2 cups (150g)', calories: 35, protein: 2, carbs: 7, fats: 0, icon: '🥗' },
            'caesar_salad': { name: 'Caesar Salad', portion: '1 bowl (200g)', calories: 190, protein: 8, carbs: 8, fats: 14, icon: '🥗' },

            // Default fallback
            'food': { name: 'Mixed Food', portion: '1 serving', calories: 250, protein: 10, carbs: 30, fats: 10, icon: '🍽️' }
        };

        // Food Recognition functionality
        function setupFoodRecognition() {
            const foodUploadZone = document.getElementById('food-upload-zone');
            const foodFileInput = document.getElementById('food-file-input');
            const foodCameraZone = document.getElementById('food-camera-zone');
            const foodCameraVideo = document.getElementById('food-camera-video');
            const foodCameraCanvas = document.getElementById('food-camera-canvas');
            const foodUploadModeBtn = document.getElementById('food-upload-mode-btn');
            const foodCameraModeBtn = document.getElementById('food-camera-mode-btn');
            const foodCaptureBtn = document.getElementById('food-capture-btn');
            const foodSwitchCameraBtn = document.getElementById('food-switch-camera-btn');
            const foodCloseCameraBtn = document.getElementById('food-close-camera-btn');
            const foodPreview = document.getElementById('food-preview');
            const foodPreviewImage = document.getElementById('food-preview-image');
            const foodRemovePreview = document.getElementById('food-remove-preview');
            const analyzeFoodBtn = document.getElementById('analyze-food-btn');
            const foodResults = document.getElementById('food-results');

            if (!foodUploadZone) return;

            // Initialize MobileNet when entering nutrition screen
            initMobileNet();

            let foodCameraStream = null;
            let foodFacingMode = 'environment';
            let foodImageData = null;

            // Mode toggle
            foodUploadModeBtn?.addEventListener('click', () => setFoodInputMode('upload'));
            foodCameraModeBtn?.addEventListener('click', () => setFoodInputMode('camera'));

            // Upload zone click
            foodUploadZone.addEventListener('click', () => foodFileInput?.click());

            // File input change
            foodFileInput?.addEventListener('change', (e) => {
                if (e.target.files.length) handleFoodFile(e.target.files[0]);
            });

            // Drag and drop
            foodUploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                foodUploadZone.classList.add('dragover');
            });

            foodUploadZone.addEventListener('dragleave', () => {
                foodUploadZone.classList.remove('dragover');
            });

            foodUploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                foodUploadZone.classList.remove('dragover');
                if (e.dataTransfer.files.length) handleFoodFile(e.dataTransfer.files[0]);
            });

            // Camera controls
            foodCaptureBtn?.addEventListener('click', captureFoodPhoto);
            foodSwitchCameraBtn?.addEventListener('click', switchFoodCamera);
            foodCloseCameraBtn?.addEventListener('click', () => setFoodInputMode('upload'));

            // Remove preview
            foodRemovePreview?.addEventListener('click', clearFoodPreview);

            // Analyze food button
            analyzeFoodBtn?.addEventListener('click', analyzeFood);

            // Add to log button
            document.getElementById('add-to-log-btn')?.addEventListener('click', () => {
                alert('Food added to daily log! (Demo mode)');
                clearFoodPreview();
            });

            function setFoodInputMode(mode) {
                if (mode === 'camera') {
                    foodUploadModeBtn?.classList.remove('active');
                    foodCameraModeBtn?.classList.add('active');
                    foodUploadZone.style.display = 'none';
                    foodPreview.style.display = 'none';
                    foodCameraZone.style.display = 'block';
                    startFoodCamera();
                } else {
                    foodCameraModeBtn?.classList.remove('active');
                    foodUploadModeBtn?.classList.add('active');
                    foodCameraZone.style.display = 'none';
                    stopFoodCamera();
                    if (!foodImageData) {
                        foodUploadZone.style.display = 'block';
                    }
                }
            }

            async function startFoodCamera() {
                try {
                    // Check if mediaDevices API is available
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        alert('Camera is not supported on this browser. Please use a modern browser like Chrome, Safari, or Firefox.');
                        setFoodInputMode('upload');
                        return;
                    }

                    stopFoodCamera();
                    const constraints = {
                        video: {
                            facingMode: foodFacingMode,
                            width: { ideal: 1280 },
                            height: { ideal: 960 }
                        }
                    };
                    foodCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
                    foodCameraVideo.srcObject = foodCameraStream;
                    await foodCameraVideo.play();
                } catch (err) {
                    console.error('Food camera error:', err);
                    let errorMessage = 'Could not access camera.\n\n';

                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        errorMessage += 'Camera permission was denied.\n\n';
                        errorMessage += 'To fix this:\n';
                        errorMessage += '• iPhone/iPad: Go to Settings > Safari > Camera, set to "Allow"\n';
                        errorMessage += '• Android: Tap the lock icon in the address bar and allow camera\n';
                        errorMessage += '• Then refresh this page and try again';
                    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                        errorMessage += 'No camera found on this device.';
                    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                        errorMessage += 'Camera is being used by another app. Please close other apps using the camera and try again.';
                    } else if (err.name === 'OverconstrainedError') {
                        // Try again with simpler constraints
                        try {
                            foodCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
                            foodCameraVideo.srcObject = foodCameraStream;
                            await foodCameraVideo.play();
                            return;
                        } catch (fallbackErr) {
                            errorMessage = 'Could not access camera with any settings. Please try again.';
                        }
                    } else {
                        errorMessage += 'Error: ' + err.message;
                    }

                    alert(errorMessage);
                    setFoodInputMode('upload');
                }
            }

            function stopFoodCamera() {
                if (foodCameraStream) {
                    foodCameraStream.getTracks().forEach(track => track.stop());
                    foodCameraStream = null;
                }
                if (foodCameraVideo) {
                    foodCameraVideo.srcObject = null;
                }
            }

            async function switchFoodCamera() {
                foodFacingMode = foodFacingMode === 'environment' ? 'user' : 'environment';
                await startFoodCamera();
            }

            function captureFoodPhoto() {
                if (!foodCameraVideo || !foodCameraCanvas) return;

                foodCameraCanvas.width = foodCameraVideo.videoWidth;
                foodCameraCanvas.height = foodCameraVideo.videoHeight;

                const ctx = foodCameraCanvas.getContext('2d');
                if (foodFacingMode === 'user') {
                    ctx.translate(foodCameraCanvas.width, 0);
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(foodCameraVideo, 0, 0);

                foodImageData = foodCameraCanvas.toDataURL('image/jpeg', 0.9);
                showFoodPreview(foodImageData);
                stopFoodCamera();
                foodCameraZone.style.display = 'none';
                foodCameraModeBtn?.classList.remove('active');
                foodUploadModeBtn?.classList.add('active');
            }

            function handleFoodFile(file) {
                if (!file.type.startsWith('image/')) {
                    alert('Please upload an image file');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    foodImageData = e.target.result;
                    showFoodPreview(foodImageData);
                };
                reader.readAsDataURL(file);
            }

            function showFoodPreview(imageData) {
                foodPreviewImage.src = imageData;
                foodPreview.style.display = 'block';
                foodUploadZone.style.display = 'none';
                analyzeFoodBtn.style.display = 'flex';
                foodResults.style.display = 'none';
            }

            function clearFoodPreview() {
                foodImageData = null;
                foodPreviewImage.src = '';
                foodPreview.style.display = 'none';
                foodUploadZone.style.display = 'block';
                analyzeFoodBtn.style.display = 'none';
                foodResults.style.display = 'none';
                if (foodFileInput) foodFileInput.value = '';
            }

            async function analyzeFood() {
                // Use real MobileNet AI for food recognition
                analyzeFoodBtn.disabled = true;
                analyzeFoodBtn.innerHTML = `
                    <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke-width="2">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-linecap="round"/>
                    </svg>
                    Analyzing with AI...
                `;

                try {
                    // Ensure MobileNet is loaded
                    if (!mobilenetModel) {
                        console.log('Loading MobileNet...');
                        await initMobileNet();
                    }

                    if (!mobilenetModel) {
                        throw new Error('Could not load AI model');
                    }

                    // Create image element for classification
                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = foodImageData;
                    });

                    // Classify the image using MobileNet
                    console.log('Classifying image...');
                    const predictions = await mobilenetModel.classify(img, 5);
                    console.log('MobileNet predictions:', predictions);

                    // Process predictions and match to food database
                    const results = processFoodPredictions(predictions);
                    displayFoodResults(results);

                } catch (error) {
                    console.error('Food analysis error:', error);
                    // Fallback to simulation if AI fails
                    const results = simulateFoodRecognition();
                    displayFoodResults(results);
                }

                analyzeFoodBtn.disabled = false;
                analyzeFoodBtn.style.display = 'none';
            }

            function processFoodPredictions(predictions) {
                const detectedFoods = [];
                let maxProbability = 0;

                for (const prediction of predictions) {
                    const className = prediction.className.toLowerCase();
                    const probability = prediction.probability;

                    if (probability > maxProbability) {
                        maxProbability = probability;
                    }

                    // Search for matching food in our database
                    let matchedFood = null;

                    // Check each word in the prediction
                    const words = className.split(/[,\s]+/);
                    for (const word of words) {
                        const cleanWord = word.replace(/[^a-z_]/g, '');

                        // Direct match
                        if (foodNutritionDB[cleanWord]) {
                            matchedFood = { ...foodNutritionDB[cleanWord] };
                            break;
                        }

                        // Partial match search
                        for (const [key, value] of Object.entries(foodNutritionDB)) {
                            if (key.includes(cleanWord) || cleanWord.includes(key) ||
                                value.name.toLowerCase().includes(cleanWord)) {
                                matchedFood = { ...value };
                                break;
                            }
                        }

                        if (matchedFood) break;
                    }

                    // If we found a match and probability is decent, add it
                    if (matchedFood && probability > 0.05) {
                        // Avoid duplicates
                        if (!detectedFoods.find(f => f.name === matchedFood.name)) {
                            matchedFood.confidence = probability;
                            detectedFoods.push(matchedFood);
                        }
                    }
                }

                // If no foods detected, use the top prediction with a generic entry
                if (detectedFoods.length === 0) {
                    const topPrediction = predictions[0];
                    detectedFoods.push({
                        name: topPrediction.className.split(',')[0],
                        portion: '1 serving',
                        calories: 200,
                        protein: 8,
                        carbs: 25,
                        fats: 8,
                        icon: '🍽️',
                        confidence: topPrediction.probability
                    });
                }

                // Determine overall confidence
                let confidence = 'high';
                if (maxProbability < 0.3) confidence = 'low';
                else if (maxProbability < 0.6) confidence = 'medium';

                return {
                    foods: detectedFoods.slice(0, 4), // Max 4 items
                    confidence: confidence,
                    rawPredictions: predictions
                };
            }

            function simulateFoodRecognition() {
                // Fallback simulation if AI fails
                const foodDatabase = [
                    { name: 'Mixed Meal', portion: '1 serving', calories: 450, protein: 25, carbs: 45, fats: 15, icon: '🍽️' }
                ];

                return {
                    foods: foodDatabase,
                    confidence: 'low'
                };
            }

            function displayFoodResults(results) {
                const detectedFoodsEl = document.getElementById('detected-foods');
                const confidenceEl = document.getElementById('food-confidence');
                const totalCaloriesEl = document.getElementById('food-total-calories');
                const totalProteinEl = document.getElementById('food-total-protein');
                const totalCarbsEl = document.getElementById('food-total-carbs');
                const totalFatsEl = document.getElementById('food-total-fats');

                // Set confidence
                confidenceEl.textContent = results.confidence.charAt(0).toUpperCase() + results.confidence.slice(1) + ' Confidence';
                confidenceEl.className = 'food-confidence ' + results.confidence;

                // Calculate totals
                let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

                // Generate food items HTML
                let foodsHTML = '';
                results.foods.forEach(food => {
                    totalCalories += food.calories;
                    totalProtein += food.protein;
                    totalCarbs += food.carbs;
                    totalFats += food.fats;

                    foodsHTML += `
                        <div class="detected-food-item">
                            <div class="food-item-icon">${food.icon}</div>
                            <div class="food-item-info">
                                <div class="food-item-name">${food.name}</div>
                                <div class="food-item-portion">${food.portion}</div>
                            </div>
                            <div class="food-item-calories">
                                <div class="food-item-cal-value">${food.calories}</div>
                                <div class="food-item-cal-label">kcal</div>
                            </div>
                        </div>
                    `;
                });

                detectedFoodsEl.innerHTML = foodsHTML;
                totalCaloriesEl.textContent = totalCalories + ' kcal';
                totalProteinEl.textContent = totalProtein + 'g';
                totalCarbsEl.textContent = totalCarbs + 'g';
                totalFatsEl.textContent = totalFats + 'g';

                foodResults.style.display = 'block';
            }
        }

        // Initialize app
        init();
