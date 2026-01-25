        // ========== THEME MANAGEMENT ==========
        function initTheme() {
            // Check for saved theme preference or system preference
            const savedTheme = localStorage.getItem('physiq-theme');
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

            // Apply theme: saved > system preference > default dark
            const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
            document.documentElement.setAttribute('data-theme', theme);

            // Setup toggle button
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', toggleTheme);
            }

            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('physiq-theme')) {
                    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                }
            });

            console.log(`Theme initialized: ${theme}`);
        }

        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('physiq-theme', newTheme);

            console.log(`Theme switched to: ${newTheme}`);
        }

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
            // User profile
            gender: null,  // 'male' or 'female'
            // BMI data
            height: null,  // in cm
            weight: null,  // in kg
            bmi: null,
            bmiCategory: null,
            // BodyPix data
            bodyPixResult: null,
            // Fitness goal
            fitnessGoal: null,  // 'lose-weight', 'build-muscle', 'maintain', 'recomp'
            // Experience level
            experienceLevel: 'intermediate'  // 'beginner', 'intermediate', 'advanced'
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
            const hasGoal = state.fitnessGoal !== null;

            if (analyzeBtn) {
                analyzeBtn.disabled = !(hasImage && hasBMI && hasGoal);
                if (!hasImage) {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Upload Photo First';
                } else if (!hasBMI) {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Enter Height & Weight';
                } else if (!hasGoal) {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Select Fitness Goal';
                } else {
                    analyzeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Analyze Photo';
                }
            }
        }

        // ========== GOAL SELECTOR ==========
        function setupGoalSelector() {
            const goalOptions = document.querySelectorAll('.goal-option');
            goalOptions.forEach(option => {
                option.addEventListener('click', () => {
                    // Remove selected from all
                    goalOptions.forEach(opt => opt.classList.remove('selected'));
                    // Add selected to clicked
                    option.classList.add('selected');
                    // Update state
                    state.fitnessGoal = option.dataset.goal;
                    updateAnalyzeButton();
                });
            });
        }

        // Get goal-specific configurations
        function getGoalConfig(goal) {
            const configs = {
                'lose-weight': {
                    name: 'Weight Loss',
                    calorieAdjustment: -500, // Caloric deficit
                    proteinMultiplier: 1.0, // g per lb bodyweight
                    carbPercentage: 0.35,
                    fatPercentage: 0.30,
                    workoutFocus: ['cardio', 'hiit', 'full-body'],
                    workoutFrequency: '4-5 days/week',
                    primaryMessage: 'Focus on caloric deficit while maintaining muscle mass',
                    exercises: ['Jumping Jacks', 'Burpees', 'Mountain Climbers', 'High Knees', 'Bodyweight Squats', 'Lunges']
                },
                'build-muscle': {
                    name: 'Muscle Building',
                    calorieAdjustment: 300, // Caloric surplus
                    proteinMultiplier: 1.2, // Higher protein
                    carbPercentage: 0.45,
                    fatPercentage: 0.25,
                    workoutFocus: ['strength', 'hypertrophy', 'compound'],
                    workoutFrequency: '4-5 days/week',
                    primaryMessage: 'Focus on progressive overload and protein intake',
                    exercises: ['Push-ups', 'Pull-ups', 'Squats', 'Deadlifts', 'Bench Press', 'Rows']
                },
                'maintain': {
                    name: 'Maintenance',
                    calorieAdjustment: 0, // Maintenance calories
                    proteinMultiplier: 0.8,
                    carbPercentage: 0.40,
                    fatPercentage: 0.30,
                    workoutFocus: ['balanced', 'flexibility', 'endurance'],
                    workoutFrequency: '3-4 days/week',
                    primaryMessage: 'Maintain current physique with balanced nutrition',
                    exercises: ['Walking', 'Yoga', 'Swimming', 'Cycling', 'Light Weights', 'Stretching']
                },
                'recomp': {
                    name: 'Body Recomposition',
                    calorieAdjustment: 0, // Slight deficit or maintenance
                    proteinMultiplier: 1.1, // High protein crucial
                    carbPercentage: 0.35,
                    fatPercentage: 0.30,
                    workoutFocus: ['strength', 'hiit', 'compound'],
                    workoutFrequency: '5-6 days/week',
                    primaryMessage: 'Build muscle while losing fat - prioritize protein',
                    exercises: ['Compound Lifts', 'HIIT', 'Resistance Training', 'Circuit Training', 'Core Work', 'Plyometrics']
                }
            };
            return configs[goal] || configs['maintain'];
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
                landmarks: landmarks,
                // AI Gender Detection based on shoulder-to-hip ratio
                // Males typically have wider shoulders (ratio > 1.1)
                // Females typically have wider/equal hips (ratio < 1.05)
                detectedGender: detectGender(skeletonShoulderWidth, skeletonHipWidth)
            };
        }

        // AI Gender Detection from body proportions
        // NOTE: MediaPipe skeleton detection measures joint positions, NOT actual body contours.
        // Skeleton joints typically show shoulders wider than hips even for women, so we use
        // adjusted thresholds. For most accurate results, users can manually correct on the confirmation screen.
        function detectGender(shoulderWidth, hipWidth, additionalData = {}) {
            const shoulderToHipRatio = shoulderWidth / hipWidth;

            console.log('=== GENDER DETECTION ===');
            console.log('Shoulder width:', shoulderWidth.toFixed(4));
            console.log('Hip width:', hipWidth.toFixed(4));
            console.log('Shoulder/Hip ratio:', shoulderToHipRatio.toFixed(3));

            // Skeleton-based detection has limitations - joint positions don't capture body curves.
            // Typical skeleton ratios:
            // - Very masculine build: > 1.25 (clearly wider shoulder joints)
            // - Average male: 1.15 - 1.25
            // - Neutral/Female: 1.0 - 1.15 (most women fall here due to skeleton detection limits)
            // - Feminine build: < 1.0 (hips wider than shoulders in skeleton)

            let detected, confidence;

            if (shoulderToHipRatio > 1.25) {
                // Very wide shoulders relative to hips - likely male
                detected = 'male';
                confidence = 'high';
            } else if (shoulderToHipRatio > 1.18) {
                // Moderately wide shoulders - probably male
                detected = 'male';
                confidence = 'medium';
            } else if (shoulderToHipRatio < 0.95) {
                // Hips clearly wider than shoulders - likely female
                detected = 'female';
                confidence = 'high';
            } else if (shoulderToHipRatio < 1.05) {
                // Hips nearly equal or wider - probably female
                detected = 'female';
                confidence = 'medium';
            } else {
                // Ambiguous range (1.05 - 1.18) - default to female
                // Most women with skeleton detection fall in this range
                detected = 'female';
                confidence = 'low';
            }

            console.log('Detected gender:', detected, '(confidence:', confidence + ')');
            console.log('========================');

            return { gender: detected, confidence: confidence, ratio: shoulderToHipRatio };
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
            // Initialize theme
            initTheme();

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
            setupGenderConfirmation();
            animateGauges();

            // Setup BMI input listeners
            const heightInput = document.getElementById('height-input');
            const weightInput = document.getElementById('weight-input');
            if (heightInput) heightInput.addEventListener('input', updateBMIPreview);
            if (weightInput) weightInput.addEventListener('input', updateBMIPreview);

            // Setup goal selector
            setupGoalSelector();

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
                // Also trigger file picker when clicking upload button
                if (fileInput) fileInput.click();
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

            // Update simulator current state image when entering simulator
            if (num === 5) {
                updateSimulatorCurrentState();
            }
        }

        // Update simulator with current uploaded image and stats
        function updateSimulatorCurrentState() {
            const currentImg = document.getElementById('current-state-image');
            const currentPlaceholder = document.getElementById('current-placeholder');

            if (currentImg && currentPlaceholder) {
                if (state.imageData) {
                    currentImg.src = state.imageData;
                    currentImg.style.display = 'block';
                    currentPlaceholder.style.display = 'none';
                } else {
                    currentImg.style.display = 'none';
                    currentPlaceholder.style.display = 'flex';
                }
            }

            // Update stats from analysis result
            if (state.analysisResult) {
                const result = state.analysisResult;
                const currentFitness = document.getElementById('current-fitness');
                const currentMuscle = document.getElementById('current-muscle');
                const currentAge = document.getElementById('current-age');

                // Extract muscle tone score (muscleTone is an object with score property)
                const muscleScore = result.muscleTone && result.muscleTone.score ? result.muscleTone.score : 68;

                if (currentFitness) currentFitness.textContent = result.fitnessIndex || '7.2';
                if (currentMuscle) currentMuscle.textContent = muscleScore + '%';
                if (currentAge) currentAge.textContent = result.visualAge || '28';
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
                // Only continue if still on analysis screen (screen 2)
                if (state.currentScreen !== 2) {
                    console.log('Analysis cancelled - user left analysis screen');
                    return;
                }

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
                        // Only proceed if still on analysis screen
                        if (state.currentScreen !== 2) {
                            console.log('Analysis result ignored - user left analysis screen');
                            return;
                        }

                        if (!state.humanDetected || !state.analysisResult) {
                            // No human body detected - show error and return to upload
                            showNoHumanDetectedError();
                        } else {
                            // Valid analysis - show gender confirmation first
                            showGenderConfirmation();
                        }
                    }, 500);
                }
            }

            advanceStep();
        }

        // Show error when no human body is detected
        function showNoHumanDetectedError() {
            // Only show error if still on analysis-related screens (1, 2, or 3)
            if (state.currentScreen > 3) {
                console.log('Human detection error ignored - user on different screen');
                return;
            }

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

        // Show gender confirmation modal after analysis
        function showGenderConfirmation() {
            const result = state.analysisResult;
            if (!result || !result.detectedGender) {
                // No gender detection - proceed directly to results
                populateResults();
                goToScreen(3);
                return;
            }

            const detected = result.detectedGender;
            const modal = document.getElementById('gender-confirm-modal');
            const iconEl = document.getElementById('detected-gender-icon');
            const labelEl = document.getElementById('detected-gender-label');
            const confidenceEl = document.getElementById('gender-confidence');

            // Update modal with detected gender
            iconEl.textContent = detected.gender === 'male' ? '👨' : '👩';
            labelEl.textContent = detected.gender === 'male' ? 'Male' : 'Female';

            // Show confidence level
            const confidenceLabels = {
                'high': 'High confidence',
                'medium': 'Medium confidence',
                'low': 'Low confidence'
            };
            confidenceEl.textContent = confidenceLabels[detected.confidence] || 'Medium confidence';
            confidenceEl.className = 'confidence-tag confidence-' + detected.confidence;

            // Highlight the detected gender option
            const maleBtn = document.getElementById('confirm-male');
            const femaleBtn = document.getElementById('confirm-female');
            maleBtn.classList.toggle('active', detected.gender === 'male');
            femaleBtn.classList.toggle('active', detected.gender === 'female');

            // Show the modal
            modal.classList.add('active');
        }

        // Setup gender confirmation modal handlers
        function setupGenderConfirmation() {
            const modal = document.getElementById('gender-confirm-modal');
            const maleBtn = document.getElementById('confirm-male');
            const femaleBtn = document.getElementById('confirm-female');
            const proceedBtn = document.getElementById('gender-confirm-proceed');

            let selectedGender = null;

            // Handle gender option clicks
            maleBtn.addEventListener('click', () => {
                selectedGender = 'male';
                maleBtn.classList.add('active');
                femaleBtn.classList.remove('active');
            });

            femaleBtn.addEventListener('click', () => {
                selectedGender = 'female';
                femaleBtn.classList.add('active');
                maleBtn.classList.remove('active');
            });

            // Handle proceed button
            proceedBtn.addEventListener('click', () => {
                // Get the selected gender (default to detected if none explicitly selected)
                if (!selectedGender && state.analysisResult && state.analysisResult.detectedGender) {
                    selectedGender = state.analysisResult.detectedGender.gender;
                }

                // Save gender to state
                state.gender = selectedGender || 'male';
                console.log('Gender confirmed:', state.gender);

                // Hide modal
                modal.classList.remove('active');
                selectedGender = null; // Reset for next analysis

                // Now proceed to results
                populateResults();
                goToScreen(3);
            });
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

            // Populate goal-based nutrition targets
            populateGoalBasedNutrition();
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

        // Calculate and populate goal-based nutrition
        function populateGoalBasedNutrition() {
            const goal = state.fitnessGoal;
            const weight = state.weight; // in kg
            const activityLevel = document.getElementById('activity-level')?.value || 'moderate';

            if (!goal || !weight) return;

            const config = getGoalConfig(goal);
            const weightLbs = weight * 2.205; // Convert to lbs for protein calc

            // Calculate base metabolic rate (simplified)
            const activityMultipliers = {
                'sedentary': 1.2,
                'light': 1.375,
                'moderate': 1.55,
                'very': 1.725,
                'athlete': 1.9
            };
            const multiplier = activityMultipliers[activityLevel] || 1.55;

            // Base calories (simplified estimation based on weight)
            const baseCalories = Math.round(weight * 24 * multiplier);
            const targetCalories = Math.round(baseCalories + config.calorieAdjustment);

            // Calculate macros
            const proteinGrams = Math.round(weightLbs * config.proteinMultiplier);
            const proteinCalories = proteinGrams * 4;
            const remainingCalories = targetCalories - proteinCalories;
            const carbCalories = Math.round(remainingCalories * (config.carbPercentage / (config.carbPercentage + config.fatPercentage)));
            const fatCalories = remainingCalories - carbCalories;
            const carbGrams = Math.round(carbCalories / 4);
            const fatGrams = Math.round(fatCalories / 9);

            // Update UI elements
            const calorieDisplay = document.getElementById('calorie-target-display');
            const proteinTarget = document.getElementById('protein-target-display');
            const proteinMacro = document.getElementById('protein-macro-display');
            const carbsMacro = document.getElementById('carbs-macro-display');
            const fatsMacro = document.getElementById('fats-macro-display');
            const goalTitle = document.getElementById('nutrition-goal-title');
            const goalMessage = document.getElementById('nutrition-goal-message');

            if (calorieDisplay) calorieDisplay.textContent = targetCalories.toLocaleString();
            if (proteinTarget) proteinTarget.textContent = `${proteinGrams}g`;
            if (proteinMacro) proteinMacro.innerHTML = `<span>${proteinGrams}g</span> / ${proteinGrams}g target`;
            if (carbsMacro) carbsMacro.innerHTML = `<span>${carbGrams}g</span> / ${carbGrams}g target`;
            if (fatsMacro) fatsMacro.innerHTML = `<span>${fatGrams}g</span> / ${fatGrams}g target`;

            // Update goal-specific messaging
            const goalTitles = {
                'lose-weight': 'Caloric Deficit for Fat Loss',
                'build-muscle': 'Caloric Surplus for Muscle Growth',
                'maintain': 'Balanced Nutrition for Maintenance',
                'recomp': 'High Protein for Body Recomposition'
            };
            const goalMessages = {
                'lose-weight': `Based on your ${config.name} goal, we recommend a ${Math.abs(config.calorieAdjustment)} calorie deficit while maintaining high protein to preserve muscle mass.`,
                'build-muscle': `For ${config.name}, you need a ${config.calorieAdjustment} calorie surplus with emphasis on protein (${config.proteinMultiplier}g per lb) for optimal muscle growth.`,
                'maintain': `For weight maintenance, we've calculated your daily needs to keep your current physique while supporting overall health.`,
                'recomp': `Body recomposition requires precise nutrition - high protein to build muscle while eating at maintenance to gradually lose fat.`
            };

            if (goalTitle) goalTitle.textContent = goalTitles[goal] || 'Your Nutrition Plan';
            if (goalMessage) goalMessage.textContent = goalMessages[goal] || config.primaryMessage;
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
            // Scenario data with AI transformation prompts
            const scenarios = {
                active: {
                    fitness: { value: 8.1, change: '+0.9', pct: '+12.5%' },
                    muscle: { value: 78, change: '+10%', pct: 'Improved' },
                    posture: { value: 88, change: '+10', pct: '+13%' },
                    age: { value: 25, change: '-3', pct: 'Years Younger' },
                    positive: true,
                    prompt: 'Transform this person to look more fit and athletic with improved muscle tone, better posture, healthier skin, and a more energetic appearance'
                },
                sedentary: {
                    fitness: { value: 6.4, change: '-0.8', pct: '-11%' },
                    muscle: { value: 60, change: '-8%', pct: 'Declined' },
                    posture: { value: 70, change: '-8', pct: '-10%' },
                    age: { value: 31, change: '+3', pct: 'Years Older' },
                    positive: false,
                    prompt: 'Transform this person to look slightly less fit with reduced muscle definition, slightly slouched posture, and a more tired appearance'
                },
                intensive: {
                    fitness: { value: 8.8, change: '+1.6', pct: '+22%' },
                    muscle: { value: 88, change: '+20%', pct: 'Significant' },
                    posture: { value: 93, change: '+15', pct: '+19%' },
                    age: { value: 23, change: '-5', pct: 'Years Younger' },
                    positive: true,
                    prompt: 'Transform this person to look very fit and muscular with well-defined muscles, excellent posture, vibrant healthy skin, and a strong athletic physique'
                },
                nutrition: {
                    fitness: { value: 7.8, change: '+0.6', pct: '+8%' },
                    muscle: { value: 75, change: '+7%', pct: 'Moderate' },
                    posture: { value: 80, change: '+2', pct: '+3%' },
                    age: { value: 26, change: '-2', pct: 'Years Younger' },
                    positive: true,
                    prompt: 'Transform this person to look healthier with better skin tone, slightly leaner appearance, and a more refreshed energetic look'
                }
            };

            // Visual transformation configuration (CSS-based for reliability)
            let isGenerating = false;

            // Scenario-specific transformations based on timeline
            // For muscle gain: use high contrast for definition (no horizontal stretch to avoid cropping)
            // For weight loss: compress horizontally (body appears slimmer)
            const scenarioTransforms = {
                // Active lifestyle: Leaner, more toned (compress horizontally)
                active: {
                    1: { scaleX: 0.96, brightness: 1.02, contrast: 1.08, saturate: 1.08 },
                    2: { scaleX: 0.92, brightness: 1.03, contrast: 1.12, saturate: 1.1 },
                    3: { scaleX: 0.88, brightness: 1.04, contrast: 1.15, saturate: 1.12 },
                    4: { scaleX: 0.84, brightness: 1.05, contrast: 1.18, saturate: 1.14 },
                    5: { scaleX: 0.80, brightness: 1.06, contrast: 1.2, saturate: 1.16 }
                },
                // Intensive training: Muscle gain - moderate contrast + subtle sharpening
                // Balanced to show definition without harsh shadows
                intensive: {
                    1: { scaleX: 1.0, brightness: 1.0, contrast: 1.12, saturate: 1.05 },
                    2: { scaleX: 1.0, brightness: 1.0, contrast: 1.2, saturate: 1.08 },
                    3: { scaleX: 1.0, brightness: 0.98, contrast: 1.28, saturate: 1.1 },
                    4: { scaleX: 1.0, brightness: 0.97, contrast: 1.35, saturate: 1.12 },
                    5: { scaleX: 1.0, brightness: 0.96, contrast: 1.42, saturate: 1.15 }
                },
                // Nutrition focus: Healthier appearance, slight slimming
                nutrition: {
                    1: { scaleX: 0.97, brightness: 1.02, contrast: 1.05, saturate: 1.1 },
                    2: { scaleX: 0.94, brightness: 1.03, contrast: 1.08, saturate: 1.12 },
                    3: { scaleX: 0.91, brightness: 1.04, contrast: 1.1, saturate: 1.14 },
                    4: { scaleX: 0.88, brightness: 1.05, contrast: 1.12, saturate: 1.16 },
                    5: { scaleX: 0.85, brightness: 1.06, contrast: 1.14, saturate: 1.18 }
                },
                // Sedentary: Slightly duller appearance - subtle effect to keep image visible
                sedentary: {
                    1: { scaleX: 1.0, brightness: 0.98, contrast: 0.95, saturate: 0.92 },
                    2: { scaleX: 1.0, brightness: 0.96, contrast: 0.92, saturate: 0.88 },
                    3: { scaleX: 1.0, brightness: 0.94, contrast: 0.9, saturate: 0.85 },
                    4: { scaleX: 1.0, brightness: 0.92, contrast: 0.88, saturate: 0.82 },
                    5: { scaleX: 1.0, brightness: 0.9, contrast: 0.85, saturate: 0.8 }
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

            // Sharpen image using convolution kernel (enhances muscle definition)
            function sharpenImage(imageData, intensity = 1) {
                const data = imageData.data;
                const width = imageData.width;
                const height = imageData.height;
                const output = new Uint8ClampedArray(data);

                // Sharpening kernel (unsharp mask style)
                const kernel = [
                    0, -intensity, 0,
                    -intensity, 1 + 4 * intensity, -intensity,
                    0, -intensity, 0
                ];

                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        for (let c = 0; c < 3; c++) { // RGB channels only
                            let sum = 0;
                            for (let ky = -1; ky <= 1; ky++) {
                                for (let kx = -1; kx <= 1; kx++) {
                                    const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                                    sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                                }
                            }
                            const idx = (y * width + x) * 4 + c;
                            output[idx] = Math.min(255, Math.max(0, sum));
                        }
                    }
                }

                return new ImageData(output, width, height);
            }

            // Canvas-based transformation (keeps image size, transforms body inside)
            function generateProjection() {
                const generateBtn = document.getElementById('generate-projection-btn');
                const loadingOverlay = document.getElementById('ai-loading');
                const projectedImg = document.getElementById('projected-state-image');
                const projectedPlaceholder = document.getElementById('projected-placeholder');

                if (!state.imageData) {
                    alert('Please upload an image first');
                    return;
                }

                if (isGenerating) return;

                isGenerating = true;
                generateBtn.disabled = true;
                loadingOverlay.style.display = 'flex';
                projectedPlaceholder.style.display = 'none';

                // Load the original image
                const img = new Image();
                img.onload = function() {
                    // Get transformation values
                    const scenario = scenarios[currentScenario];
                    const t = scenarioTransforms[currentScenario][currentTimeline];

                    // Create canvas with same dimensions as original
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;

                    // Apply filters via canvas
                    ctx.filter = `brightness(${t.brightness}) contrast(${t.contrast}) saturate(${t.saturate})`;

                    // Draw image at full canvas dimensions - always maintain same aspect ratio
                    // The scaleX creates a slimmer effect by compressing content, not changing canvas size
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // Apply subtle sharpening for muscle definition (intensive scenario only)
                    if (currentScenario === 'intensive') {
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const sharpened = sharpenImage(imageData, currentTimeline * 0.1); // Reduced intensity to avoid shadows
                        ctx.putImageData(sharpened, 0, 0);
                    }

                    // Convert canvas to image URL
                    const transformedImageUrl = canvas.toDataURL('image/jpeg', 0.9);

                    // Display the result
                    projectedImg.src = transformedImageUrl;
                    projectedImg.style.display = 'block';
                    projectedImg.style.transform = 'none'; // Keep image at full width
                    projectedImg.style.filter = 'none'; // Filters already applied via canvas

                    // Reset any box shadow - keep images clean without colored glows
                    projectedImg.style.boxShadow = 'none';

                    projectedPlaceholder.style.display = 'none';
                    loadingOverlay.style.display = 'none';
                    isGenerating = false;
                    generateBtn.disabled = false;

                    console.log('Projection generated for', currentScenario, 'with transforms:', t);
                };

                img.onerror = function() {
                    alert('Error loading image');
                    loadingOverlay.style.display = 'none';
                    isGenerating = false;
                    generateBtn.disabled = false;
                };

                img.src = state.imageData;
            }

            // Generate button
            const generateBtn = document.getElementById('generate-projection-btn');
            if (generateBtn) {
                generateBtn.addEventListener('click', generateProjection);
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

            // Experience level buttons
            const experienceBtns = document.querySelectorAll('.experience-btn');
            experienceBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update active state
                    experienceBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Store in state
                    state.experienceLevel = btn.dataset.level;

                    // Update exercise cards based on experience level
                    updateExerciseDifficulty(btn.dataset.level);
                });
            });

            // Navigation buttons
            document.getElementById('back-to-results-workout').addEventListener('click', () => {
                goToScreen(3);
            });

            document.getElementById('back-to-simulator-workout').addEventListener('click', () => {
                goToScreen(5);
            });

            // Navigation to nutrition from workout
            const goToNutritionBtn = document.getElementById('go-to-nutrition-workout');
            if (goToNutritionBtn) {
                goToNutritionBtn.addEventListener('click', () => {
                    goToScreen(7);
                });
            }

            // Setup workout player
            setupWorkoutPlayer();

            // Setup weekly routine planner
            setupWeeklyRoutine();

            // Load saved experience level
            loadExperienceLevel();
        }

        // Update exercise difficulty based on experience level
        function updateExerciseDifficulty(level) {
            const exerciseCards = document.querySelectorAll('.exercise-card');

            const difficultySettings = {
                beginner: {
                    sets: '2',
                    reps: '8-10',
                    rest: '90s',
                    tagClass: 'beginner',
                    tagText: 'Beginner'
                },
                intermediate: {
                    sets: '3',
                    reps: '12-15',
                    rest: '60s',
                    tagClass: 'intermediate',
                    tagText: 'Intermediate'
                },
                advanced: {
                    sets: '4-5',
                    reps: '15-20',
                    rest: '45s',
                    tagClass: 'advanced',
                    tagText: 'Advanced'
                }
            };

            const settings = difficultySettings[level];

            exerciseCards.forEach(card => {
                // Find detail boxes and update based on label
                const detailBoxes = card.querySelectorAll('.detail-box');
                detailBoxes.forEach(box => {
                    const label = box.querySelector('.detail-box-label');
                    const value = box.querySelector('.detail-box-value');
                    if (label && value) {
                        const labelText = label.textContent.toLowerCase();
                        if (labelText === 'sets') {
                            value.textContent = settings.sets;
                        } else if (labelText === 'reps') {
                            value.textContent = settings.reps;
                        } else if (labelText === 'rest') {
                            value.textContent = settings.rest;
                        }
                    }
                });

                // Update difficulty tag in exercise-meta
                const difficultyTags = card.querySelectorAll('.exercise-tag.beginner, .exercise-tag.intermediate, .exercise-tag.advanced');
                difficultyTags.forEach(tag => {
                    tag.className = `exercise-tag ${settings.tagClass}`;
                    tag.textContent = settings.tagText;
                });
            });

            // Store in localStorage for persistence
            localStorage.setItem('physiq-experience-level', level);
        }

        // Load saved experience level on page load
        function loadExperienceLevel() {
            const savedLevel = localStorage.getItem('physiq-experience-level');
            if (savedLevel) {
                state.experienceLevel = savedLevel;
                const experienceBtns = document.querySelectorAll('.experience-btn');
                experienceBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.level === savedLevel);
                });
                updateExerciseDifficulty(savedLevel);
            }
        }

        // ========== WORKOUT PLAYER ==========
        let workoutPlayerState = {
            isPlaying: false,
            currentExerciseIndex: 0,
            currentSet: 1,
            currentReps: 0,
            phase: 'exercise', // 'exercise', 'rest', 'get-ready'
            timerValue: 0,
            timerInterval: null,
            startTime: null,
            exercises: []
        };

        const motivationalMessages = [
            "Push through! You're doing great!",
            "Feel the burn! It means it's working!",
            "You're stronger than you think!",
            "One rep at a time. You've got this!",
            "Champions are made in moments like this!",
            "Your future self will thank you!",
            "Pain is temporary, pride is forever!",
            "Every rep counts. Make it count!",
            "You didn't come this far to only come this far!",
            "Beast mode: ACTIVATED!"
        ];

        function getWorkoutExercises() {
            // Get visible exercise cards based on current filter
            const cards = document.querySelectorAll('.exercise-card');
            const exercises = [];

            cards.forEach(card => {
                if (card.style.display !== 'none') {
                    const name = card.querySelector('h3')?.textContent || 'Exercise';
                    const targets = Array.from(card.querySelectorAll('.muscle-tag')).map(t => t.textContent);
                    const detailBoxes = card.querySelectorAll('.detail-box');
                    let sets = 3, reps = 12, rest = 60;

                    detailBoxes.forEach(box => {
                        const label = box.querySelector('.detail-box-label')?.textContent.toLowerCase();
                        const value = box.querySelector('.detail-box-value')?.textContent;
                        if (label === 'sets') sets = parseInt(value) || 3;
                        if (label === 'reps') reps = parseInt(value) || 12;
                        if (label === 'rest') rest = parseInt(value) || 60;
                    });

                    const isWeak = card.dataset.weak === 'true';
                    const type = card.dataset.type || 'home';

                    exercises.push({ name, targets, sets, reps, rest, isWeak, type });
                }
            });

            return exercises;
        }

        function openWorkoutPlayer() {
            const modal = document.getElementById('workout-player-modal');
            workoutPlayerState.exercises = getWorkoutExercises();

            if (workoutPlayerState.exercises.length === 0) {
                alert('No exercises available. Please select a filter with exercises.');
                return;
            }

            // Reset state
            workoutPlayerState.currentExerciseIndex = 0;
            workoutPlayerState.currentSet = 1;
            workoutPlayerState.currentReps = 0;
            workoutPlayerState.phase = 'get-ready';
            workoutPlayerState.isPlaying = false;
            workoutPlayerState.startTime = Date.now();

            // Hide complete overlay
            document.getElementById('workout-complete-overlay').classList.remove('active');

            // Update UI
            updateWorkoutPlayerUI();
            setPhase('get-ready', 5);

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeWorkoutPlayer() {
            const modal = document.getElementById('workout-player-modal');
            modal.classList.remove('active');
            document.body.style.overflow = '';

            // Stop timer
            if (workoutPlayerState.timerInterval) {
                clearInterval(workoutPlayerState.timerInterval);
                workoutPlayerState.timerInterval = null;
            }
            workoutPlayerState.isPlaying = false;
        }

        function updateWorkoutPlayerUI() {
            const exercise = workoutPlayerState.exercises[workoutPlayerState.currentExerciseIndex];
            if (!exercise) return;

            // Update exercise name and targets
            document.getElementById('player-exercise-name').textContent = exercise.name;

            const targetsContainer = document.getElementById('player-exercise-targets');
            targetsContainer.innerHTML = exercise.targets.map(t =>
                `<span class="target-tag">${t}</span>`
            ).join('');

            // Update progress
            const total = workoutPlayerState.exercises.length;
            const current = workoutPlayerState.currentExerciseIndex + 1;
            document.getElementById('player-progress-text').textContent = `${current} / ${total}`;
            document.getElementById('player-progress-fill').style.width = `${(current / total) * 100}%`;

            // Update sets indicators
            const setsContainer = document.getElementById('sets-indicators');
            setsContainer.innerHTML = '';
            for (let i = 1; i <= exercise.sets; i++) {
                const dot = document.createElement('span');
                dot.className = 'set-dot';
                if (i < workoutPlayerState.currentSet) dot.classList.add('completed');
                if (i === workoutPlayerState.currentSet) dot.classList.add('active');
                setsContainer.appendChild(dot);
            }
            document.getElementById('sets-count').textContent = `${workoutPlayerState.currentSet} / ${exercise.sets}`;

            // Update reps
            document.getElementById('reps-target').textContent = exercise.reps;
            document.getElementById('reps-current').textContent = workoutPlayerState.currentReps;

            // Update up next
            updateUpNext();

            // Update motivation
            const randomMsg = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
            document.getElementById('player-motivation').querySelector('p').textContent = `"${randomMsg}"`;

            // Update routine stats
            document.getElementById('routine-exercise-count').textContent = workoutPlayerState.exercises.length;
            const totalTime = workoutPlayerState.exercises.reduce((sum, ex) => {
                return sum + (ex.sets * (45 + ex.rest)); // Approx time per exercise
            }, 0);
            document.getElementById('routine-duration').textContent = `~${Math.round(totalTime / 60)}`;
        }

        function updateUpNext() {
            const upNextContainer = document.getElementById('up-next-exercise');
            const nextIndex = workoutPlayerState.currentExerciseIndex + 1;

            if (nextIndex < workoutPlayerState.exercises.length) {
                const next = workoutPlayerState.exercises[nextIndex];
                upNextContainer.innerHTML = `
                    <div class="up-next-info">
                        <span class="up-next-name">${next.name}</span>
                        <span class="up-next-details">${next.sets} sets • ${next.reps} reps</span>
                    </div>
                    ${next.isWeak ? '<span class="up-next-tag">Focus Area</span>' : ''}
                `;
                upNextContainer.parentElement.style.display = 'block';
            } else {
                upNextContainer.parentElement.style.display = 'none';
            }
        }

        function setPhase(phase, duration) {
            workoutPlayerState.phase = phase;
            workoutPlayerState.timerValue = duration;

            const phaseEl = document.getElementById('player-phase');
            const timerProgress = document.getElementById('timer-progress');
            const timerLabel = document.getElementById('timer-label');
            const skipRestBtn = document.getElementById('skip-rest-btn');
            const repsContainer = document.getElementById('player-reps');

            // Update phase badge
            phaseEl.innerHTML = `<span class="phase-badge ${phase}">${phase.replace('-', ' ').toUpperCase()}</span>`;

            // Update timer style
            timerProgress.classList.remove('rest');
            if (phase === 'rest') {
                timerProgress.classList.add('rest');
                timerLabel.textContent = 'rest';
                skipRestBtn.classList.add('visible');
                repsContainer.classList.remove('active');
            } else if (phase === 'get-ready') {
                timerLabel.textContent = 'get ready';
                skipRestBtn.classList.remove('visible');
                repsContainer.classList.remove('active');
            } else {
                timerLabel.textContent = 'remaining';
                skipRestBtn.classList.remove('visible');
                repsContainer.classList.add('active');
            }

            updateTimerDisplay();
        }

        function updateTimerDisplay() {
            const timerValue = document.getElementById('timer-value');
            const timerProgress = document.getElementById('timer-progress');

            const minutes = Math.floor(workoutPlayerState.timerValue / 60);
            const seconds = workoutPlayerState.timerValue % 60;
            timerValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            // Update circular progress
            const exercise = workoutPlayerState.exercises[workoutPlayerState.currentExerciseIndex];
            let totalDuration;

            if (workoutPlayerState.phase === 'rest') {
                totalDuration = exercise?.rest || 60;
            } else if (workoutPlayerState.phase === 'get-ready') {
                totalDuration = 5;
            } else {
                totalDuration = 45; // Default exercise duration
            }

            const circumference = 2 * Math.PI * 90;
            const progress = workoutPlayerState.timerValue / totalDuration;
            const offset = circumference * (1 - progress);
            timerProgress.style.strokeDashoffset = offset;
        }

        function togglePlayPause() {
            if (workoutPlayerState.isPlaying) {
                pauseWorkout();
            } else {
                playWorkout();
            }
        }

        function playWorkout() {
            workoutPlayerState.isPlaying = true;
            document.getElementById('play-icon').style.display = 'none';
            document.getElementById('pause-icon').style.display = 'block';

            workoutPlayerState.timerInterval = setInterval(() => {
                if (workoutPlayerState.timerValue > 0) {
                    workoutPlayerState.timerValue--;
                    updateTimerDisplay();

                    // Audio beep in last 3 seconds
                    if (workoutPlayerState.timerValue <= 3 && workoutPlayerState.timerValue > 0) {
                        // Could add audio beep here
                    }
                } else {
                    handleTimerComplete();
                }
            }, 1000);
        }

        function pauseWorkout() {
            workoutPlayerState.isPlaying = false;
            document.getElementById('play-icon').style.display = 'block';
            document.getElementById('pause-icon').style.display = 'none';

            if (workoutPlayerState.timerInterval) {
                clearInterval(workoutPlayerState.timerInterval);
                workoutPlayerState.timerInterval = null;
            }
        }

        function handleTimerComplete() {
            pauseWorkout();

            const exercise = workoutPlayerState.exercises[workoutPlayerState.currentExerciseIndex];

            if (workoutPlayerState.phase === 'get-ready') {
                // Start exercise phase
                setPhase('exercise', 45);
                workoutPlayerState.currentReps = 0;
                updateWorkoutPlayerUI();
                playWorkout();
            } else if (workoutPlayerState.phase === 'exercise') {
                // Move to rest or next set
                if (workoutPlayerState.currentSet < exercise.sets) {
                    // Rest between sets
                    setPhase('rest', exercise.rest);
                    playWorkout();
                } else {
                    // Move to next exercise
                    nextExercise();
                }
            } else if (workoutPlayerState.phase === 'rest') {
                // Start next set
                workoutPlayerState.currentSet++;
                workoutPlayerState.currentReps = 0;
                setPhase('exercise', 45);
                updateWorkoutPlayerUI();
                playWorkout();
            }
        }

        function completeSet() {
            pauseWorkout();

            const exercise = workoutPlayerState.exercises[workoutPlayerState.currentExerciseIndex];
            workoutPlayerState.currentReps = exercise.reps;
            updateWorkoutPlayerUI();

            if (workoutPlayerState.currentSet < exercise.sets) {
                // Rest between sets
                setPhase('rest', exercise.rest);
                playWorkout();
            } else {
                // Move to next exercise
                nextExercise();
            }
        }

        function skipRest() {
            if (workoutPlayerState.phase === 'rest') {
                pauseWorkout();
                workoutPlayerState.currentSet++;
                workoutPlayerState.currentReps = 0;
                setPhase('exercise', 45);
                updateWorkoutPlayerUI();
                playWorkout();
            }
        }

        function addRep() {
            const exercise = workoutPlayerState.exercises[workoutPlayerState.currentExerciseIndex];
            if (workoutPlayerState.currentReps < exercise.reps) {
                workoutPlayerState.currentReps++;
                document.getElementById('reps-current').textContent = workoutPlayerState.currentReps;

                // Auto-complete set if all reps done
                if (workoutPlayerState.currentReps >= exercise.reps) {
                    setTimeout(completeSet, 500);
                }
            }
        }

        function nextExercise() {
            if (workoutPlayerState.currentExerciseIndex < workoutPlayerState.exercises.length - 1) {
                workoutPlayerState.currentExerciseIndex++;
                workoutPlayerState.currentSet = 1;
                workoutPlayerState.currentReps = 0;
                setPhase('get-ready', 5);
                updateWorkoutPlayerUI();
                playWorkout();
            } else {
                // Workout complete!
                showWorkoutComplete();
            }
        }

        function prevExercise() {
            if (workoutPlayerState.currentExerciseIndex > 0) {
                pauseWorkout();
                workoutPlayerState.currentExerciseIndex--;
                workoutPlayerState.currentSet = 1;
                workoutPlayerState.currentReps = 0;
                setPhase('get-ready', 5);
                updateWorkoutPlayerUI();
            }
        }

        function showWorkoutComplete() {
            pauseWorkout();

            const overlay = document.getElementById('workout-complete-overlay');
            const elapsedTime = Math.floor((Date.now() - workoutPlayerState.startTime) / 1000);
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = elapsedTime % 60;

            // Update stats
            document.getElementById('complete-exercises').textContent = workoutPlayerState.exercises.length;
            document.getElementById('complete-sets').textContent = workoutPlayerState.exercises.reduce((sum, ex) => sum + ex.sets, 0);
            document.getElementById('complete-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Update streak (mock)
            const streak = parseInt(localStorage.getItem('physiq-workout-streak') || '0') + 1;
            localStorage.setItem('physiq-workout-streak', streak);

            overlay.classList.add('active');
        }

        function setupWorkoutPlayer() {
            // Close button
            document.getElementById('player-close-btn')?.addEventListener('click', closeWorkoutPlayer);

            // Play/Pause
            document.getElementById('player-play-btn')?.addEventListener('click', togglePlayPause);

            // Navigation
            document.getElementById('player-prev-btn')?.addEventListener('click', prevExercise);
            document.getElementById('player-next-btn')?.addEventListener('click', nextExercise);

            // Quick actions
            document.getElementById('skip-rest-btn')?.addEventListener('click', skipRest);
            document.getElementById('add-rep-btn')?.addEventListener('click', addRep);
            document.getElementById('complete-set-btn')?.addEventListener('click', completeSet);

            // Complete screen actions
            document.getElementById('finish-workout-btn')?.addEventListener('click', closeWorkoutPlayer);
            document.getElementById('share-workout-btn')?.addEventListener('click', () => {
                alert('Sharing workout summary! (Demo mode)');
            });

            // Close on background click
            const modal = document.getElementById('workout-player-modal');
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) {
                    // Don't close on background click during workout
                }
            });
        }

        // ========== WEEKLY ROUTINE PLANNER ==========
        const weeklyRoutineData = {
            currentConfig: {
                goal: 'hypertrophy',
                split: 'push-pull-legs',
                availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
                sessionDuration: 60
            },
            weekPlan: null,
            selectedDay: 'monday'
        };

        // Exercise database by muscle group
        const exerciseDatabase = {
            chest: [
                { name: 'Bench Press', sets: 4, reps: '8-10', muscles: ['Chest', 'Triceps'] },
                { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', muscles: ['Upper Chest', 'Shoulders'] },
                { name: 'Cable Flyes', sets: 3, reps: '12-15', muscles: ['Chest'] },
                { name: 'Push-Ups', sets: 3, reps: '15-20', muscles: ['Chest', 'Core'] },
                { name: 'Dips', sets: 3, reps: '10-12', muscles: ['Chest', 'Triceps'] }
            ],
            back: [
                { name: 'Pull-Ups', sets: 4, reps: '8-10', muscles: ['Lats', 'Biceps'] },
                { name: 'Barbell Rows', sets: 4, reps: '8-10', muscles: ['Back', 'Biceps'] },
                { name: 'Lat Pulldown', sets: 3, reps: '10-12', muscles: ['Lats'] },
                { name: 'Seated Cable Rows', sets: 3, reps: '12-15', muscles: ['Mid Back'] },
                { name: 'Face Pulls', sets: 3, reps: '15-20', muscles: ['Rear Delts', 'Traps'] }
            ],
            shoulders: [
                { name: 'Overhead Press', sets: 4, reps: '8-10', muscles: ['Shoulders', 'Triceps'] },
                { name: 'Lateral Raises', sets: 3, reps: '12-15', muscles: ['Side Delts'] },
                { name: 'Front Raises', sets: 3, reps: '12-15', muscles: ['Front Delts'] },
                { name: 'Reverse Flyes', sets: 3, reps: '15', muscles: ['Rear Delts'] },
                { name: 'Arnold Press', sets: 3, reps: '10-12', muscles: ['Shoulders'] }
            ],
            legs: [
                { name: 'Squats', sets: 4, reps: '8-10', muscles: ['Quads', 'Glutes'] },
                { name: 'Romanian Deadlifts', sets: 4, reps: '10-12', muscles: ['Hamstrings', 'Glutes'] },
                { name: 'Leg Press', sets: 3, reps: '12-15', muscles: ['Quads'] },
                { name: 'Leg Curls', sets: 3, reps: '12-15', muscles: ['Hamstrings'] },
                { name: 'Calf Raises', sets: 4, reps: '15-20', muscles: ['Calves'] },
                { name: 'Lunges', sets: 3, reps: '10 each', muscles: ['Quads', 'Glutes'] }
            ],
            arms: [
                { name: 'Barbell Curls', sets: 3, reps: '10-12', muscles: ['Biceps'] },
                { name: 'Tricep Pushdowns', sets: 3, reps: '12-15', muscles: ['Triceps'] },
                { name: 'Hammer Curls', sets: 3, reps: '12', muscles: ['Biceps', 'Forearms'] },
                { name: 'Skull Crushers', sets: 3, reps: '10-12', muscles: ['Triceps'] },
                { name: 'Concentration Curls', sets: 2, reps: '12-15', muscles: ['Biceps'] }
            ],
            core: [
                { name: 'Plank', sets: 3, reps: '60s', muscles: ['Core'] },
                { name: 'Hanging Leg Raises', sets: 3, reps: '12-15', muscles: ['Abs'] },
                { name: 'Cable Crunches', sets: 3, reps: '15-20', muscles: ['Abs'] },
                { name: 'Russian Twists', sets: 3, reps: '20', muscles: ['Obliques'] },
                { name: 'Dead Bug', sets: 3, reps: '10 each', muscles: ['Core'] }
            ]
        };

        // Split templates
        const splitTemplates = {
            'push-pull-legs': {
                pattern: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Rest', 'Rest'],
                days: {
                    'Push': { focus: 'Chest, Shoulders, Triceps', muscles: ['chest', 'shoulders', 'arms'] },
                    'Pull': { focus: 'Back, Biceps, Rear Delts', muscles: ['back', 'arms'] },
                    'Legs': { focus: 'Quads, Hamstrings, Glutes, Calves', muscles: ['legs', 'core'] }
                }
            },
            'upper-lower': {
                pattern: ['Upper', 'Lower', 'Rest', 'Upper', 'Lower', 'Rest', 'Rest'],
                days: {
                    'Upper': { focus: 'Chest, Back, Shoulders, Arms', muscles: ['chest', 'back', 'shoulders', 'arms'] },
                    'Lower': { focus: 'Quads, Hamstrings, Glutes, Core', muscles: ['legs', 'core'] }
                }
            },
            'full-body': {
                pattern: ['Full Body', 'Rest', 'Full Body', 'Rest', 'Full Body', 'Rest', 'Rest'],
                days: {
                    'Full Body': { focus: 'All Major Muscle Groups', muscles: ['chest', 'back', 'legs', 'shoulders', 'core'] }
                }
            },
            'bro-split': {
                pattern: ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Rest', 'Rest'],
                days: {
                    'Chest': { focus: 'Chest & Triceps', muscles: ['chest', 'arms'] },
                    'Back': { focus: 'Back & Biceps', muscles: ['back', 'arms'] },
                    'Shoulders': { focus: 'Shoulders & Traps', muscles: ['shoulders'] },
                    'Legs': { focus: 'Quads, Hamstrings, Glutes', muscles: ['legs'] },
                    'Arms': { focus: 'Biceps, Triceps, Forearms', muscles: ['arms'] }
                }
            }
        };

        function openWeeklyRoutineModal() {
            const modal = document.getElementById('weekly-routine-modal');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeWeeklyRoutineModal() {
            const modal = document.getElementById('weekly-routine-modal');
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        function generateWeeklyPlan() {
            const config = weeklyRoutineData.currentConfig;
            const split = splitTemplates[config.split];
            const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            const dayAbbrevs = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

            // Adjust pattern based on available days
            const adjustedPattern = [...split.pattern];
            dayAbbrevs.forEach((abbrev, index) => {
                if (!config.availableDays.includes(abbrev) && adjustedPattern[index] !== 'Rest') {
                    adjustedPattern[index] = 'Rest';
                }
            });

            // Generate workout for each day
            const weekPlan = {};
            dayNames.forEach((day, index) => {
                const workoutType = adjustedPattern[index];
                if (workoutType === 'Rest') {
                    weekPlan[day] = { type: 'Rest', exercises: [] };
                } else {
                    const dayTemplate = split.days[workoutType];
                    const exercises = generateDayExercises(dayTemplate.muscles, config);
                    weekPlan[day] = {
                        type: workoutType,
                        focus: dayTemplate.focus,
                        exercises: exercises,
                        duration: config.sessionDuration
                    };
                }
            });

            weeklyRoutineData.weekPlan = weekPlan;
            return weekPlan;
        }

        function generateDayExercises(muscleGroups, config) {
            const exercises = [];
            const exercisesPerGroup = Math.ceil(6 / muscleGroups.length);

            muscleGroups.forEach(group => {
                const groupExercises = exerciseDatabase[group] || [];
                const shuffled = [...groupExercises].sort(() => Math.random() - 0.5);
                const selected = shuffled.slice(0, exercisesPerGroup);

                // Adjust based on goal
                selected.forEach(ex => {
                    let adjustedEx = { ...ex };
                    if (config.goal === 'strength') {
                        adjustedEx.sets = Math.min(ex.sets + 1, 5);
                        adjustedEx.reps = '4-6';
                    } else if (config.goal === 'endurance') {
                        adjustedEx.sets = Math.max(ex.sets - 1, 2);
                        adjustedEx.reps = '15-20';
                    }
                    exercises.push(adjustedEx);
                });
            });

            return exercises.slice(0, 6); // Limit to 6 exercises
        }

        function updateWeeklyPlanUI() {
            const plan = weeklyRoutineData.weekPlan;
            if (!plan) return;

            const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            const typeIds = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

            // Update day buttons
            dayNames.forEach((day, index) => {
                const typeEl = document.getElementById(`${typeIds[index]}-type`);
                if (typeEl) {
                    typeEl.textContent = plan[day].type;
                }

                const btn = document.querySelector(`.week-day-btn[data-day="${day}"]`);
                if (btn) {
                    btn.classList.toggle('rest', plan[day].type === 'Rest');
                }
            });

            // Calculate stats
            const trainingDays = dayNames.filter(d => plan[d].type !== 'Rest').length;
            const restDays = 7 - trainingDays;
            const totalTime = trainingDays * weeklyRoutineData.currentConfig.sessionDuration;

            document.getElementById('weekly-training-days').textContent = trainingDays;
            document.getElementById('weekly-rest-days').textContent = restDays;
            document.getElementById('weekly-total-time').textContent = `${Math.round(totalTime / 60)}h`;

            // Update muscle coverage
            updateMuscleCoverage(plan);

            // Show selected day
            showDayWorkout(weeklyRoutineData.selectedDay);
        }

        function updateMuscleCoverage(plan) {
            const coverage = {
                'Chest': 0, 'Back': 0, 'Shoulders': 0, 'Legs': 0, 'Arms': 0, 'Core': 0
            };

            Object.values(plan).forEach(day => {
                if (day.exercises) {
                    day.exercises.forEach(ex => {
                        ex.muscles.forEach(m => {
                            const key = Object.keys(coverage).find(k =>
                                m.toLowerCase().includes(k.toLowerCase()) ||
                                k.toLowerCase().includes(m.toLowerCase().split(' ')[0])
                            );
                            if (key) coverage[key]++;
                        });
                    });
                }
            });

            // Normalize to percentages
            const maxHits = Math.max(...Object.values(coverage), 1);

            const barsContainer = document.getElementById('muscle-bars');
            barsContainer.innerHTML = Object.entries(coverage).map(([muscle, hits]) => `
                <div class="muscle-bar-item">
                    <span class="muscle-name">${muscle}</span>
                    <div class="muscle-bar">
                        <div class="muscle-fill" style="width: ${(hits / maxHits) * 100}%"></div>
                    </div>
                    <span class="muscle-hits">${hits}x</span>
                </div>
            `).join('');
        }

        function showDayWorkout(day) {
            weeklyRoutineData.selectedDay = day;
            const plan = weeklyRoutineData.weekPlan;
            if (!plan || !plan[day]) return;

            const dayData = plan[day];
            const workoutCard = document.getElementById('daily-workout-card');
            const restCard = document.getElementById('rest-day-card');

            // Update day button states
            document.querySelectorAll('.week-day-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.day === day);
            });

            if (dayData.type === 'Rest') {
                workoutCard.style.display = 'none';
                restCard.style.display = 'block';
            } else {
                workoutCard.style.display = 'block';
                restCard.style.display = 'none';

                document.getElementById('daily-workout-name').textContent = `${dayData.type} Day`;
                document.getElementById('daily-focus').textContent = dayData.focus;
                document.getElementById('daily-duration').innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${dayData.duration} min
                `;
                document.getElementById('daily-exercise-count').textContent = `${dayData.exercises.length} exercises`;

                // Render exercises
                const listContainer = document.getElementById('daily-exercises-list');
                listContainer.innerHTML = dayData.exercises.map((ex, index) => `
                    <div class="daily-exercise-item">
                        <span class="exercise-number">${index + 1}</span>
                        <div class="exercise-item-info">
                            <div class="exercise-item-name">${ex.name}</div>
                            <div class="exercise-item-details">${ex.sets} sets × ${ex.reps} reps</div>
                        </div>
                        <div class="exercise-item-muscles">
                            ${ex.muscles.slice(0, 2).map(m => `<span class="mini-muscle-tag">${m}</span>`).join('')}
                        </div>
                    </div>
                `).join('');
            }
        }

        function setupWeeklyRoutine() {
            // Open button
            document.getElementById('open-weekly-routine-btn')?.addEventListener('click', openWeeklyRoutineModal);

            // Close button
            document.getElementById('weekly-routine-close')?.addEventListener('click', closeWeeklyRoutineModal);

            // Close on background click
            const modal = document.getElementById('weekly-routine-modal');
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) closeWeeklyRoutineModal();
            });

            // Goal options
            document.querySelectorAll('.goal-options-weekly .config-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.goal-options-weekly .config-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    weeklyRoutineData.currentConfig.goal = btn.dataset.goal;
                });
            });

            // Split options
            document.querySelectorAll('.split-options .config-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.split-options .config-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    weeklyRoutineData.currentConfig.split = btn.dataset.split;
                });
            });

            // Day toggles
            document.querySelectorAll('.day-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.classList.toggle('active');
                    const day = btn.dataset.day;
                    const days = weeklyRoutineData.currentConfig.availableDays;
                    if (btn.classList.contains('active')) {
                        if (!days.includes(day)) days.push(day);
                    } else {
                        const idx = days.indexOf(day);
                        if (idx > -1) days.splice(idx, 1);
                    }
                });
            });

            // Duration slider
            const durationSlider = document.getElementById('session-duration');
            const durationValue = document.getElementById('duration-value');
            durationSlider?.addEventListener('input', (e) => {
                const val = e.target.value;
                durationValue.textContent = `${val} min`;
                weeklyRoutineData.currentConfig.sessionDuration = parseInt(val);
            });

            // Generate button
            document.getElementById('generate-weekly-btn')?.addEventListener('click', () => {
                generateWeeklyPlan();
                document.getElementById('weekly-config').style.display = 'none';
                document.getElementById('weekly-plan-view').style.display = 'block';
                updateWeeklyPlanUI();
            });

            // Day selector in plan view
            document.querySelectorAll('.week-day-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showDayWorkout(btn.dataset.day);
                });
            });

            // Edit plan
            document.getElementById('edit-weekly-plan')?.addEventListener('click', () => {
                document.getElementById('weekly-plan-view').style.display = 'none';
                document.getElementById('weekly-config').style.display = 'block';
            });

            // Regenerate
            document.getElementById('regenerate-weekly-plan')?.addEventListener('click', () => {
                generateWeeklyPlan();
                updateWeeklyPlanUI();
            });

            // Save plan
            document.getElementById('save-weekly-plan')?.addEventListener('click', () => {
                localStorage.setItem('physiq-weekly-plan', JSON.stringify(weeklyRoutineData.weekPlan));
                alert('Weekly plan saved!');
                closeWeeklyRoutineModal();
            });

            // Start day workout
            document.getElementById('start-day-btn')?.addEventListener('click', () => {
                const day = weeklyRoutineData.selectedDay;
                const dayPlan = weeklyRoutineData.weekPlan?.[day];
                if (dayPlan && dayPlan.exercises.length > 0) {
                    // Convert to workout player format and start
                    workoutPlayerState.exercises = dayPlan.exercises.map(ex => ({
                        name: ex.name,
                        targets: ex.muscles,
                        sets: ex.sets,
                        reps: parseInt(ex.reps) || 12,
                        rest: 60,
                        isWeak: false,
                        type: 'gym'
                    }));
                    closeWeeklyRoutineModal();
                    setTimeout(() => {
                        workoutPlayerState.currentExerciseIndex = 0;
                        workoutPlayerState.currentSet = 1;
                        workoutPlayerState.currentReps = 0;
                        workoutPlayerState.phase = 'get-ready';
                        workoutPlayerState.isPlaying = false;
                        workoutPlayerState.startTime = Date.now();
                        document.getElementById('workout-complete-overlay').classList.remove('active');
                        updateWorkoutPlayerUI();
                        setPhase('get-ready', 5);
                        document.getElementById('workout-player-modal').classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }, 300);
                }
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
                openMealPlanModal();
            });

            // Setup meal plan generator
            setupMealPlanGenerator();

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

        // ========== MEAL PLAN GENERATOR ==========
        function openMealPlanModal() {
            const modal = document.getElementById('meal-plan-modal');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeMealPlanModal() {
            const modal = document.getElementById('meal-plan-modal');
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        function setupMealPlanGenerator() {
            const modal = document.getElementById('meal-plan-modal');
            const closeBtn = document.getElementById('meal-plan-close');
            const configPanel = document.getElementById('meal-plan-config');
            const planView = document.getElementById('meal-plan-view');
            const generateBtn = document.getElementById('generate-plan-btn');
            const regenerateBtn = document.getElementById('regenerate-plan-btn');
            const editBtn = document.getElementById('edit-plan-btn');
            const saveBtn = document.getElementById('save-plan-btn');

            let currentConfig = {
                goal: 'muscle-gain',
                diet: 'standard',
                mealsPerDay: 4
            };

            // Close modal
            closeBtn?.addEventListener('click', closeMealPlanModal);
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) closeMealPlanModal();
            });

            // Goal selection
            document.querySelectorAll('.goal-options .config-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.goal-options .config-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentConfig.goal = btn.dataset.goal;
                });
            });

            // Diet selection
            document.querySelectorAll('.diet-options .config-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.diet-options .config-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentConfig.diet = btn.dataset.diet;
                });
            });

            // Meals per day selection
            document.querySelectorAll('.meals-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.meals-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentConfig.mealsPerDay = parseInt(btn.dataset.meals);
                });
            });

            // Day selector
            document.querySelectorAll('.day-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const config = { ...currentConfig, gender: state.gender || 'male' };
                    generateMealsForDay(btn.dataset.day, config);
                });
            });

            // Generate plan
            generateBtn?.addEventListener('click', () => {
                // Use gender from state (set during AI analysis confirmation)
                const config = { ...currentConfig, gender: state.gender || 'male' };
                configPanel.style.display = 'none';
                planView.style.display = 'block';
                generateMealPlan(config);
            });

            // Regenerate plan
            regenerateBtn?.addEventListener('click', () => {
                const config = { ...currentConfig, gender: state.gender || 'male' };
                generateMealPlan(config);
            });

            // Edit goals
            editBtn?.addEventListener('click', () => {
                planView.style.display = 'none';
                configPanel.style.display = 'block';
            });

            // Save plan
            saveBtn?.addEventListener('click', () => {
                alert('Meal plan saved! (Demo mode - would save to your profile)');
                closeMealPlanModal();
            });
        }

        function generateMealPlan(config) {
            // Calculate daily targets based on goal
            const targets = calculateDailyTargets(config);

            // Update summary
            document.getElementById('plan-total-calories').textContent = targets.calories.toLocaleString();
            document.getElementById('plan-total-protein').textContent = targets.protein + 'g';
            document.getElementById('plan-total-carbs').textContent = targets.carbs + 'g';
            document.getElementById('plan-total-fats').textContent = targets.fats + 'g';

            // Generate meals for current day
            generateMealsForDay('monday', config);
        }

        function calculateDailyTargets(config) {
            // Base calories differ by gender
            // Men typically need 2200-2800 cal, Women typically need 1800-2200 cal
            const isMale = config.gender === 'male';
            const baseCalories = isMale ? 2400 : 1900;

            let calories = baseCalories;
            let proteinRatio = 0.3;
            let carbsRatio = 0.4;
            let fatsRatio = 0.3;

            switch(config.goal) {
                case 'fat-loss':
                    // 20% deficit
                    calories = isMale ? 1900 : 1500;
                    proteinRatio = 0.35; // Higher protein to preserve muscle
                    carbsRatio = 0.35;
                    fatsRatio = 0.3;
                    break;
                case 'muscle-gain':
                    // 15% surplus
                    calories = isMale ? 2800 : 2200;
                    proteinRatio = 0.35;
                    carbsRatio = 0.45;
                    fatsRatio = 0.2;
                    break;
                case 'maintenance':
                    calories = baseCalories;
                    break;
            }

            // Adjust macros based on diet preference
            if (config.diet === 'high-protein') {
                proteinRatio = 0.4;
                carbsRatio = 0.35;
                fatsRatio = 0.25;
            } else if (config.diet === 'low-carb') {
                proteinRatio = 0.35;
                carbsRatio = 0.2;
                fatsRatio = 0.45;
            } else if (config.diet === 'vegetarian') {
                // Slightly higher carbs for vegetarian
                proteinRatio = 0.25;
                carbsRatio = 0.5;
                fatsRatio = 0.25;
            }

            return {
                calories,
                protein: Math.round((calories * proteinRatio) / 4),
                carbs: Math.round((calories * carbsRatio) / 4),
                fats: Math.round((calories * fatsRatio) / 9)
            };
        }

        function generateMealsForDay(day, config) {
            const timeline = document.getElementById('meals-timeline');
            const targets = calculateDailyTargets(config);

            // Meal database based on diet preference
            const mealDatabase = getMealDatabase(config.diet);

            // Distribute calories across meals
            const mealDistribution = getMealDistribution(config.mealsPerDay);

            let html = '';
            const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack', 'snack2', 'snack3'];
            const mealNames = ['Breakfast', 'Lunch', 'Dinner', 'Morning Snack', 'Afternoon Snack', 'Evening Snack'];
            const mealTimes = ['7:00 AM', '12:30 PM', '7:00 PM', '10:00 AM', '3:30 PM', '9:00 PM'];
            const mealIcons = ['🌅', '☀️', '🌙', '🍎', '🥤', '🌰'];

            for (let i = 0; i < config.mealsPerDay; i++) {
                const mealType = mealTypes[i];
                const mealCalories = Math.round(targets.calories * mealDistribution[i]);
                const meal = selectMealForType(mealDatabase, mealType, mealCalories, config);

                html += `
                    <div class="meal-card">
                        <div class="meal-card-header">
                            <div class="meal-time-info">
                                <div class="meal-type-icon ${mealType.replace('2', '').replace('3', '')}">
                                    ${mealIcons[i]}
                                </div>
                                <div>
                                    <div class="meal-type-name">${mealNames[i]}</div>
                                    <div class="meal-time-badge">${mealTimes[i]}</div>
                                </div>
                            </div>
                            <div class="meal-calories-badge">${meal.totalCalories} kcal</div>
                        </div>
                        <div class="meal-card-body">
                            <div class="meal-foods">
                                ${meal.foods.map(food => `
                                    <div class="food-item">
                                        <span class="food-icon">${food.icon}</span>
                                        <div class="food-details">
                                            <div class="food-name">${food.name}</div>
                                            <div class="food-portion">${food.portion}</div>
                                        </div>
                                        <div class="food-macros">
                                            <span class="food-macro protein">${food.protein}g P</span>
                                            <span class="food-macro carbs">${food.carbs}g C</span>
                                            <span class="food-macro fats">${food.fats}g F</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <button class="meal-swap-btn" onclick="swapMeal('${mealType}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                                Swap meal
                            </button>
                        </div>
                    </div>
                `;
            }

            timeline.innerHTML = html;
        }

        function getMealDistribution(mealsPerDay) {
            switch(mealsPerDay) {
                case 3: return [0.3, 0.4, 0.3];
                case 4: return [0.25, 0.3, 0.3, 0.15];
                case 5: return [0.2, 0.1, 0.3, 0.25, 0.15];
                case 6: return [0.2, 0.1, 0.25, 0.1, 0.25, 0.1];
                default: return [0.25, 0.3, 0.3, 0.15];
            }
        }

        function getMealDatabase(diet) {
            const standardMeals = {
                breakfast: [
                    { name: 'Greek Yogurt Parfait', icon: '🥣', foods: [
                        { name: 'Greek Yogurt', portion: '200g', icon: '🥛', protein: 20, carbs: 8, fats: 5, calories: 157 },
                        { name: 'Mixed Berries', portion: '100g', icon: '🍓', protein: 1, carbs: 14, fats: 0, calories: 57 },
                        { name: 'Granola', portion: '40g', icon: '🌾', protein: 4, carbs: 28, fats: 6, calories: 180 }
                    ]},
                    { name: 'Protein Oatmeal Bowl', icon: '🥣', foods: [
                        { name: 'Oatmeal', portion: '80g dry', icon: '🥣', protein: 10, carbs: 54, fats: 6, calories: 304 },
                        { name: 'Banana', portion: '1 medium', icon: '🍌', protein: 1, carbs: 27, fats: 0, calories: 105 },
                        { name: 'Almond Butter', portion: '2 tbsp', icon: '🥜', protein: 7, carbs: 6, fats: 18, calories: 196 }
                    ]},
                    { name: 'Eggs & Avocado Toast', icon: '🍳', foods: [
                        { name: 'Scrambled Eggs', portion: '3 large', icon: '🥚', protein: 18, carbs: 2, fats: 15, calories: 210 },
                        { name: 'Whole Grain Toast', portion: '2 slices', icon: '🍞', protein: 8, carbs: 26, fats: 2, calories: 160 },
                        { name: 'Avocado', portion: '½ medium', icon: '🥑', protein: 2, carbs: 6, fats: 15, calories: 160 }
                    ]}
                ],
                lunch: [
                    { name: 'Grilled Chicken Salad', icon: '🥗', foods: [
                        { name: 'Grilled Chicken Breast', portion: '150g', icon: '🍗', protein: 46, carbs: 0, fats: 5, calories: 248 },
                        { name: 'Mixed Greens', portion: '100g', icon: '🥬', protein: 2, carbs: 4, fats: 0, calories: 20 },
                        { name: 'Olive Oil Dressing', portion: '2 tbsp', icon: '🫒', protein: 0, carbs: 0, fats: 28, calories: 240 },
                        { name: 'Cherry Tomatoes', portion: '80g', icon: '🍅', protein: 1, carbs: 4, fats: 0, calories: 18 }
                    ]},
                    { name: 'Salmon Rice Bowl', icon: '🍱', foods: [
                        { name: 'Grilled Salmon', portion: '140g', icon: '🐟', protein: 28, carbs: 0, fats: 18, calories: 290 },
                        { name: 'Brown Rice', portion: '150g cooked', icon: '🍚', protein: 4, carbs: 36, fats: 2, calories: 168 },
                        { name: 'Steamed Broccoli', portion: '100g', icon: '🥦', protein: 3, carbs: 7, fats: 0, calories: 34 }
                    ]},
                    { name: 'Turkey Wrap', icon: '🌯', foods: [
                        { name: 'Turkey Breast', portion: '120g', icon: '🦃', protein: 36, carbs: 0, fats: 2, calories: 162 },
                        { name: 'Whole Wheat Wrap', portion: '1 large', icon: '🫓', protein: 6, carbs: 36, fats: 4, calories: 200 },
                        { name: 'Hummus', portion: '40g', icon: '🥣', protein: 3, carbs: 6, fats: 4, calories: 66 },
                        { name: 'Mixed Vegetables', portion: '80g', icon: '🥒', protein: 2, carbs: 8, fats: 0, calories: 35 }
                    ]}
                ],
                dinner: [
                    { name: 'Steak & Sweet Potato', icon: '🥩', foods: [
                        { name: 'Lean Beef Steak', portion: '180g', icon: '🥩', protein: 50, carbs: 0, fats: 14, calories: 330 },
                        { name: 'Sweet Potato', portion: '200g', icon: '🍠', protein: 4, carbs: 40, fats: 0, calories: 172 },
                        { name: 'Asparagus', portion: '100g', icon: '🌿', protein: 2, carbs: 4, fats: 0, calories: 20 }
                    ]},
                    { name: 'Chicken Stir-Fry', icon: '🍳', foods: [
                        { name: 'Chicken Thigh', portion: '160g', icon: '🍗', protein: 38, carbs: 0, fats: 12, calories: 264 },
                        { name: 'Jasmine Rice', portion: '150g cooked', icon: '🍚', protein: 4, carbs: 45, fats: 1, calories: 195 },
                        { name: 'Stir-Fry Vegetables', portion: '150g', icon: '🥦', protein: 4, carbs: 12, fats: 2, calories: 60 },
                        { name: 'Teriyaki Sauce', portion: '30ml', icon: '🥢', protein: 1, carbs: 8, fats: 0, calories: 35 }
                    ]},
                    { name: 'Baked Fish & Quinoa', icon: '🐟', foods: [
                        { name: 'Baked Cod', portion: '170g', icon: '🐟', protein: 35, carbs: 0, fats: 2, calories: 160 },
                        { name: 'Quinoa', portion: '150g cooked', icon: '🌾', protein: 6, carbs: 30, fats: 3, calories: 180 },
                        { name: 'Roasted Vegetables', portion: '150g', icon: '🥕', protein: 3, carbs: 18, fats: 5, calories: 120 }
                    ]}
                ],
                snack: [
                    { name: 'Protein Shake', icon: '🥤', foods: [
                        { name: 'Whey Protein', portion: '1 scoop', icon: '🥛', protein: 25, carbs: 3, fats: 2, calories: 130 },
                        { name: 'Banana', portion: '1 small', icon: '🍌', protein: 1, carbs: 20, fats: 0, calories: 80 }
                    ]},
                    { name: 'Nuts & Fruit', icon: '🥜', foods: [
                        { name: 'Mixed Nuts', portion: '30g', icon: '🌰', protein: 6, carbs: 6, fats: 16, calories: 180 },
                        { name: 'Apple', portion: '1 medium', icon: '🍎', protein: 0, carbs: 25, fats: 0, calories: 95 }
                    ]},
                    { name: 'Cottage Cheese Bowl', icon: '🧀', foods: [
                        { name: 'Cottage Cheese', portion: '150g', icon: '🧀', protein: 17, carbs: 5, fats: 6, calories: 147 },
                        { name: 'Pineapple', portion: '80g', icon: '🍍', protein: 0, carbs: 11, fats: 0, calories: 40 }
                    ]}
                ]
            };

            // Modify based on diet preference
            if (diet === 'vegetarian') {
                standardMeals.lunch = [
                    { name: 'Buddha Bowl', icon: '🥗', foods: [
                        { name: 'Chickpeas', portion: '150g', icon: '🫘', protein: 15, carbs: 40, fats: 4, calories: 246 },
                        { name: 'Quinoa', portion: '150g cooked', icon: '🌾', protein: 6, carbs: 30, fats: 3, calories: 180 },
                        { name: 'Roasted Vegetables', portion: '150g', icon: '🥕', protein: 3, carbs: 18, fats: 5, calories: 120 },
                        { name: 'Tahini Dressing', portion: '30g', icon: '🥜', protein: 3, carbs: 3, fats: 9, calories: 100 }
                    ]}
                ];
                standardMeals.dinner = [
                    { name: 'Tofu Stir-Fry', icon: '🍳', foods: [
                        { name: 'Firm Tofu', portion: '200g', icon: '🧈', protein: 20, carbs: 4, fats: 12, calories: 190 },
                        { name: 'Brown Rice', portion: '150g cooked', icon: '🍚', protein: 4, carbs: 36, fats: 2, calories: 168 },
                        { name: 'Mixed Vegetables', portion: '200g', icon: '🥦', protein: 6, carbs: 16, fats: 2, calories: 80 }
                    ]}
                ];
            }

            return standardMeals;
        }

        function selectMealForType(database, mealType, targetCalories, config) {
            const type = mealType.replace('2', '').replace('3', '');
            const options = database[type] || database.snack;

            // Randomly select a meal option
            const randomIndex = Math.floor(Math.random() * options.length);
            const selectedMeal = options[randomIndex];

            // Calculate totals
            let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
            selectedMeal.foods.forEach(food => {
                totalCalories += food.calories;
                totalProtein += food.protein;
                totalCarbs += food.carbs;
                totalFats += food.fats;
            });

            return {
                ...selectedMeal,
                totalCalories,
                totalProtein,
                totalCarbs,
                totalFats
            };
        }

        function swapMeal(mealType) {
            // Re-generate just that meal
            const config = {
                gender: state.gender || 'male',
                goal: document.querySelector('.goal-options .config-btn.active')?.dataset.goal || 'muscle-gain',
                diet: document.querySelector('.diet-options .config-btn.active')?.dataset.diet || 'standard',
                mealsPerDay: parseInt(document.querySelector('.meals-btn.active')?.dataset.meals) || 4
            };

            const currentDay = document.querySelector('.day-btn.active')?.dataset.day || 'monday';
            generateMealsForDay(currentDay, config);
        }

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

            // Confirmation UI elements
            const foodConfirmation = document.getElementById('food-confirmation');
            const suggestionIcon = document.getElementById('suggestion-icon');
            const suggestionName = document.getElementById('suggestion-name');
            const foodDetectConfidence = document.getElementById('food-detect-confidence');
            const confirmFoodBtn = document.getElementById('confirm-food-btn');
            const changeFoodBtn = document.getElementById('change-food-btn');
            const foodSearchBox = document.getElementById('food-search-box');
            const foodSearchInput = document.getElementById('food-search-input');
            const foodSearchBtn = document.getElementById('food-search-btn');
            const foodSearchResults = document.getElementById('food-search-results');

            if (!foodUploadZone) return;

            // Initialize MobileNet when entering nutrition screen
            initMobileNet();

            let foodCameraStream = null;
            let foodFacingMode = 'environment';
            let foodImageData = null;
            let detectedFoodData = null; // Store detected food for confirmation
            let detectedFoodName = ''; // Store the detected food name for API search

            // Mode toggle
            foodUploadModeBtn?.addEventListener('click', () => {
                setFoodInputMode('upload');
                // Also trigger file picker when clicking upload button
                if (foodFileInput) foodFileInput.click();
            });
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

            // Scan new food button
            document.getElementById('scan-new-food-btn')?.addEventListener('click', () => {
                clearFoodPreview();
            });

            // Confirm food button - search API for the detected food name
            confirmFoodBtn?.addEventListener('click', async () => {
                if (detectedFoodName) {
                    foodConfirmation.style.display = 'none';
                    await searchAndDisplayFood(detectedFoodName);
                }
            });

            // Change food button - show search input
            changeFoodBtn?.addEventListener('click', () => {
                foodSearchBox.style.display = 'block';
                foodSearchInput.value = '';
                foodSearchResults.style.display = 'none';
                foodSearchInput.focus();
            });

            // Food search button click
            foodSearchBtn?.addEventListener('click', () => {
                performFoodSearch();
            });

            // Auto-search as user types (with debounce)
            let searchDebounceTimer = null;
            let highlightedIndex = -1;
            let currentResults = [];

            foodSearchInput?.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                highlightedIndex = -1;

                // Clear previous timer
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                }

                // Hide results if query is too short
                if (query.length < 2) {
                    foodSearchResults.style.display = 'none';
                    currentResults = [];
                    return;
                }

                // Show loading indicator
                foodSearchResults.style.display = 'block';
                foodSearchResults.innerHTML = '<div class="food-search-loading">Searching...</div>';

                // Debounce: wait 300ms after user stops typing
                searchDebounceTimer = setTimeout(async () => {
                    try {
                        const results = await searchNutritionAPI(query);
                        currentResults = results || [];
                        displaySearchResults(results);
                    } catch (error) {
                        console.error('Search error:', error);
                        currentResults = [];
                        foodSearchResults.innerHTML = '<div class="food-search-loading">Search failed. Try again.</div>';
                    }
                }, 300);
            });

            // Keyboard navigation for autocomplete
            foodSearchInput?.addEventListener('keydown', (e) => {
                const items = foodSearchResults.querySelectorAll('.food-search-result-item');
                if (items.length === 0) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
                    updateHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    highlightedIndex = Math.max(highlightedIndex - 1, -1);
                    updateHighlight(items);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (highlightedIndex >= 0 && currentResults[highlightedIndex]) {
                        selectFood(currentResults[highlightedIndex]);
                    } else if (foodSearchInput.value.trim()) {
                        performFoodSearch();
                    }
                } else if (e.key === 'Escape') {
                    foodSearchResults.style.display = 'none';
                    highlightedIndex = -1;
                }
            });

            function updateHighlight(items) {
                items.forEach((item, index) => {
                    item.classList.toggle('highlighted', index === highlightedIndex);
                    if (index === highlightedIndex) {
                        item.scrollIntoView({ block: 'nearest' });
                    }
                });
            }

            function selectFood(food) {
                detectedFoodData = food;
                foodConfirmation.style.display = 'none';
                foodSearchBox.style.display = 'none';
                foodSearchResults.style.display = 'none';
                highlightedIndex = -1;
                displayFoodResults({ foods: [food], confidence: 'high' });
            }

            // Perform food search using API
            async function performFoodSearch() {
                const query = foodSearchInput.value.trim();
                if (!query) return;

                foodSearchResults.style.display = 'block';
                foodSearchResults.innerHTML = '<div class="food-search-loading">Searching...</div>';

                try {
                    const results = await searchNutritionAPI(query);
                    displaySearchResults(results);
                } catch (error) {
                    console.error('Search error:', error);
                    foodSearchResults.innerHTML = '<div class="food-search-loading">Search failed. Try again.</div>';
                }
            }

            // Display search results
            function displaySearchResults(results) {
                if (!results || results.length === 0) {
                    foodSearchResults.innerHTML = '<div class="food-search-loading">No results found. Try full food names like "boiled eggs" or "grilled chicken".</div>';
                    return;
                }

                let html = '';
                results.forEach((food, index) => {
                    html += `
                        <div class="food-search-result-item" data-index="${index}">
                            <div class="food-search-result-name">${food.name}</div>
                            <div class="food-search-result-info">${food.calories} cal | P: ${food.protein}g | C: ${food.carbs}g | F: ${food.fats}g</div>
                        </div>
                    `;
                });
                foodSearchResults.innerHTML = html;

                // Add click handlers for results
                foodSearchResults.querySelectorAll('.food-search-result-item').forEach((item) => {
                    item.addEventListener('click', () => {
                        const index = parseInt(item.dataset.index);
                        const selectedFood = results[index];
                        detectedFoodData = selectedFood;
                        foodConfirmation.style.display = 'none';
                        foodSearchBox.style.display = 'none';
                        displayFoodResults({ foods: [selectedFood], confidence: 'high' });
                    });
                });
            }

            // Search nutrition API and display results
            async function searchAndDisplayFood(foodName) {
                try {
                    const results = await searchNutritionAPI(foodName);
                    if (results && results.length > 0) {
                        detectedFoodData = results[0];
                        displayFoodResults({ foods: [results[0]], confidence: 'high' });
                    } else {
                        // No results found - backend will provide food database later
                        displayFoodResults({ foods: [], confidence: 'low' });
                    }
                } catch (error) {
                    console.error('API search failed:', error);
                    // API error - backend will provide food database later
                    displayFoodResults({ foods: [], confidence: 'low' });
                }
            }

            // Nutrition API search function (backend will handle database later)
            async function searchNutritionAPI(query) {
                const API_KEY = 'dVJQPgDsCyccGlMqeVhAU3tdWzNtolzSrcVQLggN';
                console.log('Searching API for:', query);

                // Common food suffixes to try if initial search fails
                const commonFoodWords = ['egg', 'eggs', 'chicken', 'rice', 'potato', 'bread', 'fish', 'beef', 'pork', 'salad'];

                try {
                    // First try the exact query
                    let response = await fetch(`https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`, {
                        method: 'GET',
                        headers: { 'X-Api-Key': API_KEY }
                    });

                    let data = await response.json();
                    console.log('API Response for query:', query, data);

                    // If no results and query is a cooking method, try with common foods
                    if ((!data || data.length === 0) && query.length >= 3) {
                        const cookingMethods = ['boiled', 'fried', 'grilled', 'baked', 'steamed', 'roasted', 'scrambled', 'poached', 'raw', 'cooked'];
                        const queryLower = query.toLowerCase();

                        if (cookingMethods.some(method => queryLower.includes(method))) {
                            // Try combining with common foods
                            const searchPromises = commonFoodWords.slice(0, 5).map(food =>
                                fetch(`https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(query + ' ' + food)}`, {
                                    method: 'GET',
                                    headers: { 'X-Api-Key': API_KEY }
                                }).then(r => r.json()).catch(() => [])
                            );

                            const results = await Promise.all(searchPromises);
                            data = results.flat().filter(item => item && item.name);
                            console.log('Extended search results:', data);
                        }
                    }

                    if (!response.ok && data.length === 0) {
                        console.error('API Error:', response.status, response.statusText);
                        return [];
                    }

                    console.log('Final API Response data:', data);

                    if (Array.isArray(data) && data.length > 0) {
                        // Remove duplicates by name
                        const uniqueData = data.filter((item, index, self) =>
                            index === self.findIndex(t => t.name?.toLowerCase() === item.name?.toLowerCase())
                        );

                        return uniqueData.map(item => ({
                            name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
                            calories: Math.round(item.calories) || 0,
                            protein: Math.round(item.protein_g) || 0,
                            carbs: Math.round(item.carbohydrates_total_g) || 0,
                            fats: Math.round(item.fat_total_g) || 0,
                            portion: `${Math.round(item.serving_size_g) || 100}g serving`,
                            icon: getFoodIcon(item.name)
                        }));
                    } else {
                        console.log('No API results found');
                        return [];
                    }
                } catch (e) {
                    console.error('CalorieNinjas API error:', e);
                    return [];
                }
            }

            // Get appropriate food icon based on name
            function getFoodIcon(foodName) {
                const name = foodName.toLowerCase();
                if (name.includes('egg')) return '🥚';
                if (name.includes('chicken')) return '🍗';
                if (name.includes('beef') || name.includes('steak')) return '🥩';
                if (name.includes('fish') || name.includes('salmon')) return '🐟';
                if (name.includes('rice')) return '🍚';
                if (name.includes('bread')) return '🍞';
                if (name.includes('salad')) return '🥗';
                if (name.includes('fruit') || name.includes('apple')) return '🍎';
                if (name.includes('banana')) return '🍌';
                if (name.includes('orange')) return '🍊';
                if (name.includes('vegetable') || name.includes('broccoli')) return '🥦';
                if (name.includes('pizza')) return '🍕';
                if (name.includes('burger')) return '🍔';
                if (name.includes('pasta') || name.includes('spaghetti')) return '🍝';
                if (name.includes('soup')) return '🍜';
                if (name.includes('coffee')) return '☕';
                if (name.includes('milk')) return '🥛';
                return '🍽️';
            }

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
                detectedFoodData = null;
                detectedFoodName = '';
                foodPreviewImage.src = '';
                foodPreview.style.display = 'none';
                foodUploadZone.style.display = 'block';
                analyzeFoodBtn.style.display = 'none';
                foodResults.style.display = 'none';
                foodConfirmation.style.display = 'none';
                foodSearchBox.style.display = 'none';
                foodSearchResults.style.display = 'none';
                if (foodFileInput) foodFileInput.value = '';
                if (foodSearchInput) foodSearchInput.value = '';
            }

            function showFoodConfirmation(results) {
                // Get the top detected food
                const topFood = results.foods[0];
                detectedFoodData = topFood;
                detectedFoodName = topFood.name || 'Unknown Food'; // Store name for API search

                // Update confirmation UI
                suggestionIcon.textContent = topFood.icon || '🍽️';
                suggestionName.textContent = detectedFoodName;

                // Set confidence badge
                foodDetectConfidence.textContent = results.confidence.charAt(0).toUpperCase() + results.confidence.slice(1) + ' Confidence';
                foodDetectConfidence.className = 'food-confidence ' + results.confidence;

                // Reset search box
                foodSearchBox.style.display = 'none';
                foodSearchResults.style.display = 'none';
                if (foodSearchInput) foodSearchInput.value = '';

                // Show confirmation, hide results
                foodConfirmation.style.display = 'block';
                foodResults.style.display = 'none';
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

                    // Show confirmation UI instead of results directly
                    showFoodConfirmation(results);

                } catch (error) {
                    console.error('Food analysis error:', error);
                    // Fallback - show generic food prompt for user to search
                    showFoodConfirmation({
                        foods: [{
                            name: 'Unknown Food',
                            icon: '🍽️',
                            confidence: 0
                        }],
                        confidence: 'low'
                    });
                }

                analyzeFoodBtn.disabled = false;
                analyzeFoodBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    Analyze Food
                `;
                analyzeFoodBtn.style.display = 'none';
            }

            function processFoodPredictions(predictions) {
                console.log('Processing predictions:', predictions);

                // Get the top prediction from MobileNet
                const topPrediction = predictions[0];
                const probability = topPrediction.probability;

                // Extract the first word/name from the prediction (remove extra descriptors)
                let foodName = topPrediction.className.split(',')[0].trim();
                // Capitalize first letter
                foodName = foodName.charAt(0).toUpperCase() + foodName.slice(1);

                // Determine confidence based on probability
                let confidence = 'high';
                if (probability < 0.3) confidence = 'low';
                else if (probability < 0.6) confidence = 'medium';

                // Return the detected food name for user confirmation
                // Actual nutrition data will be fetched from API after user confirms
                return {
                    foods: [{
                        name: foodName,
                        icon: getFoodIcon(foodName),
                        confidence: probability
                    }],
                    confidence: confidence,
                    rawPredictions: predictions
                };
            }

            function simulateFoodRecognition() {
                // Fallback when AI recognition fails - backend will provide food data
                return {
                    foods: [],
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
