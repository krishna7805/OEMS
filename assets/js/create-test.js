import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    query, 
    where,
    getDocs,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM ELEMENT SELECTION ---
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');
const backToGroupLink = document.getElementById('back-to-group-link');
const testTitleInput = document.getElementById('test-title-input');
const testStatusBadge = document.getElementById('test-status-badge');
const reviewBtn = document.getElementById('review-btn');
const questionBuilder = document.getElementById('question-builder');
const addQuestionFab = document.getElementById('add-question-fab');

// Modal Elements
const summaryModal = document.getElementById('summary-modal-overlay');
const summaryModalClose = document.getElementById('summary-modal-close');
const summaryTitleInput = document.getElementById('summary-title-input');
const summaryDescription = document.getElementById('summary-description');
const summaryToolbar = document.getElementById('summary-toolbar');
const summaryTestCode = document.getElementById('summary-test-code');
const summaryQuestions = document.getElementById('summary-questions');
const summaryMarks = document.getElementById('summary-marks');
const shuffleToggle = document.getElementById('shuffle-questions-toggle');
const backToEditingBtn = document.getElementById('back-to-editing-btn');
const saveDraftBtn = document.getElementById('save-draft-btn');

// Publish Dropdown Elements
const publishMainBtn = document.getElementById('publish-main-btn');
const publishDropdown = document.getElementById('publish-dropdown');
const publishDropdownMenu = document.getElementById('publish-dropdown-menu');
const publishNowBtn = document.getElementById('publish-now-btn');
const schedulePublishBtn = document.getElementById('schedule-publish-btn');
const scheduleContainer = document.getElementById('schedule-container');
const scheduleDateTimeInput = document.getElementById('schedule-datetime');
const confirmScheduleBtn = document.getElementById('confirm-schedule-btn');
const cancelScheduleBtn = document.getElementById('cancel-schedule-btn');

// --- STATE MANAGEMENT ---
let currentUser, testId, groupId;
let testState = { questions: new Map() };
let debounceTimer;

// --- UTILITY FUNCTIONS ---
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const p = document.createElement("p");
    p.textContent = str;
    return p.innerHTML;
}

// --- DROPDOWN MANAGEMENT FUNCTIONS ---
function openPublishDropdown() {
    if (publishDropdown && publishDropdownMenu) {
        publishDropdown.classList.add('active');
        
        // Check if dropdown would go off-screen and adjust positioning
        const dropdownRect = publishDropdownMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const buttonRect = publishMainBtn.getBoundingClientRect();
        
        // Reset classes
        publishDropdownMenu.classList.remove('align-left');
        
        // If dropdown would extend past right edge of screen
        if (buttonRect.right + 200 > viewportWidth - 20) {
            publishDropdownMenu.classList.add('align-left');
        }
        
        document.addEventListener('click', handleClickOutside);
    }
}

function closePublishDropdown() {
    if (publishDropdown) {
        publishDropdown.classList.remove('active');
        document.removeEventListener('click', handleClickOutside);
    }
}

function handleClickOutside(event) {
    if (publishDropdown && !publishDropdown.contains(event.target)) {
        closePublishDropdown();
    }
}

function showScheduleContainer() {
    if (scheduleContainer) {
        scheduleContainer.style.display = 'block';
        closePublishDropdown();
    }
}

function hideScheduleContainer() {
    if (scheduleContainer) {
        scheduleContainer.style.display = 'none';
    }
}

// --- DEBOUNCE UTILITY ---
const debounceSave = (func, delay) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
};

// --- INITIALIZATION & SECURITY ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("create-test.js: Page loaded");

    // Get values from localStorage first, then URL as fallback
    testId = localStorage.getItem('current_edit_test_id');
    groupId = localStorage.getItem('current_edit_group_id');
    
    if (!testId || !groupId) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTestId = urlParams.get('testId');
        const urlGroupId = urlParams.get('groupId');
        
        if (urlTestId && urlGroupId) {
            console.log("Using URL parameters instead of localStorage");
            testId = urlTestId;
            groupId = urlGroupId;
            
            localStorage.setItem('current_edit_test_id', testId);
            localStorage.setItem('current_edit_group_id', groupId);
        }
    }
    
    console.log("Final IDs - testId:", testId, "groupId:", groupId);

    if (!testId || !groupId) {
        console.error("Missing required IDs in both localStorage and URL");
        alert('Missing test or group information. Redirecting...');
        window.location.href = 'dashboard.html';
        return;
    }
    
    if (backToGroupLink) {
        backToGroupLink.href = `group.html?id=${groupId}`;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log("No authenticated user - redirecting to login");
            window.location.href = 'index.html';
            return;
        }
        
        console.log("User authenticated:", user.uid);
        currentUser = user;
        
        if (userDisplayName) {
            userDisplayName.textContent = user.displayName || user.email;
        }
        
        try {
            await checkPermissionsAndLoadData();
        } catch (err) {
            console.error("Failed to load editor:", err);
            alert("An error occurred while loading the test editor.");
        }
    });

    setupEventListeners();
});

// --- PERMISSION & DATA LOADING ---
async function checkPermissionsAndLoadData() {
    try {
        const groupRef = doc(db, 'groups', groupId);
        const groupDoc = await getDoc(groupRef);
        if (!groupDoc.exists() || groupDoc.data().ownerId !== currentUser.uid) {
            alert("You are not authorized to edit tests in this group.");
            window.location.href = `group.html?id=${groupId}`;
            return;
        }
        await loadTestData();
    } catch (error) {
        console.error("Permission check failed:", error);
        alert("An error occurred while verifying permissions.");
    }
}

async function loadTestData() {
    try {
        const testRef = doc(db, "tests", testId);
        const testDoc = await getDoc(testRef);
        if (!testDoc.exists()) {
            alert("Test not found.");
            window.location.href = `group.html?id=${groupId}`;
            return;
        }
        
        Object.assign(testState, testDoc.data());
        
        if (testTitleInput) {
            testTitleInput.value = testState.title || 'Untitled Test';
        }
        
        if (testStatusBadge) {
            testStatusBadge.textContent = testState.status ? 
                testState.status.charAt(0).toUpperCase() + testState.status.slice(1) : 'Draft';
        }

        const questionsQuery = query(collection(db, `tests/${testId}/questions`));
        const querySnapshot = await getDocs(questionsQuery);
        
        if (questionBuilder) {
            questionBuilder.innerHTML = '';
            testState.questions.clear();

            if (querySnapshot.empty) {
                await addQuestion();
            } else {
                const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                questions.sort((a, b) => (a.order || 0) - (b.order || 0));
                questions.forEach(q => {
                    testState.questions.set(q.id, q);
                    renderQuestionCard(q);
                });
            }
        }
    } catch (error) {
        console.error("Error loading test data:", error);
        alert("Failed to load test data.");
    }
}

// --- QUESTION RENDERING ---
function renderQuestionCard(question) {
    if (!questionBuilder) return;
    
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.questionId = question.id;

    const questionTypes = {
        'multiple-choice': 'Multiple Choice',
        'short-answer': 'Short Answer'
    };

    let questionBodyHTML = '';
    if (question.questionType === 'multiple-choice') {
        const options = question.options || ['', ''];
        const optionsHTML = options.map((opt, i) => `
            <div class="option-row">
                <input type="radio" name="correct-option-${question.id}" value="${i}" ${question.correctAnswerIndex === i ? 'checked' : ''}>
                <input type="text" class="neu-input option-text" placeholder="Option ${i + 1}" value="${escapeHtml(opt)}">
                ${options.length > 2 ? '<button type="button" class="remove-option-btn" title="Remove Option">&times;</button>' : ''}
            </div>
        `).join('');
        questionBodyHTML = `<div class="mc-options-list">${optionsHTML}</div><button type="button" class="add-option-btn">+ Add Option</button>`;
    } else if (question.questionType === 'short-answer') {
        const answers = question.validAnswers || [''];
        const answersHTML = answers.map((ans, i) => `
            <div class="answer-row">
                <input type="text" class="neu-input answer-text" placeholder="Valid Answer ${i + 1}" value="${escapeHtml(ans)}">
                ${answers.length > 1 ? '<button type="button" class="remove-answer-btn" title="Remove Answer">&times;</button>' : ''}
            </div>
        `).join('');
        questionBodyHTML = `<div class="sa-answers-list">${answersHTML}</div><button type="button" class="add-answer-btn">+ Add another valid answer</button>`;
    }

    card.innerHTML = `
        <div class="question-header">
            <h3>Question ${(question.order || 0) + 1}</h3>
            <select class="neu-input question-type-select">
                ${Object.entries(questionTypes).map(([value, text]) => `<option value="${value}" ${question.questionType === value ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
        </div>
        <div class="question-body">
            <textarea class="neu-input question-text" placeholder="Enter your question here...">${escapeHtml(question.questionText || '')}</textarea>
            <div class="question-specific-body">${questionBodyHTML}</div>
        </div>
        <div class="question-footer">
            <div class="footer-actions">
                <div class="toggle-switch-container">
                    <label for="required-${question.id}">Required</label>
                    <label class="toggle-switch"><input type="checkbox" id="required-${question.id}" class="required-toggle" ${question.isRequired ? 'checked' : ''}><span class="slider"></span></label>
                </div>
                <div class="toggle-switch-container">
                    <label for="manual-${question.id}">Manual Grade</label>
                    <label class="toggle-switch"><input type="checkbox" id="manual-${question.id}" class="manual-grade-toggle" ${question.isManualGrade ? 'checked' : ''}><span class="slider"></span></label>
                </div>
            </div>
            <div class="footer-actions">
                <button type="button" class="btn-icon move-up" title="Move Up">▲</button>
                <button type="button" class="btn-icon move-down" title="Move Down">▼</button>
                <button type="button" class="btn-icon delete" title="Delete Question">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `;
    questionBuilder.appendChild(card);
}

// --- QUESTION TYPE HANDLING ---
function handleQuestionTypeChange(card, newType) {
    const questionId = card.dataset.questionId;
    const question = testState.questions.get(questionId);
    if (!question) return;

    question.questionType = newType;
    
    const specificBody = card.querySelector('.question-specific-body');
    if (!specificBody) return;

    let bodyHTML = '';
    if (newType === 'multiple-choice') {
        const options = question.options || ['', ''];
        const optionsHTML = options.map((opt, i) => `
            <div class="option-row">
                <input type="radio" name="correct-option-${questionId}" value="${i}" ${question.correctAnswerIndex === i ? 'checked' : ''}>
                <input type="text" class="neu-input option-text" placeholder="Option ${i + 1}" value="${escapeHtml(opt)}">
                ${options.length > 2 ? '<button type="button" class="remove-option-btn" title="Remove Option">&times;</button>' : ''}
            </div>
        `).join('');
        bodyHTML = `<div class="mc-options-list">${optionsHTML}</div><button type="button" class="add-option-btn">+ Add Option</button>`;
    } else if (newType === 'short-answer') {
        const answers = question.validAnswers || [''];
        const answersHTML = answers.map((ans, i) => `
            <div class="answer-row">
                <input type="text" class="neu-input answer-text" placeholder="Valid Answer ${i + 1}" value="${escapeHtml(ans)}">
                ${answers.length > 1 ? '<button type="button" class="remove-answer-btn" title="Remove Answer">&times;</button>' : ''}
            </div>
        `).join('');
        bodyHTML = `<div class="sa-answers-list">${answersHTML}</div><button type="button" class="add-answer-btn">+ Add another valid answer</button>`;
    }
    
    specificBody.innerHTML = bodyHTML;
    saveQuestionState(card);
}

// --- QUESTION MANAGEMENT ---
async function addQuestion() {
    try {
        const order = testState.questions.size;
        const newQuestion = {
            questionText: "",
            questionType: 'multiple-choice',
            options: ["", ""],
            correctAnswerIndex: null,
            validAnswers: [],
            isRequired: true,
            isManualGrade: false,
            order: order
        };
        
        const questionRef = await addDoc(collection(db, `tests/${testId}/questions`), newQuestion);
        newQuestion.id = questionRef.id;
        testState.questions.set(newQuestion.id, newQuestion);
        renderQuestionCard(newQuestion);
        updateQuestionNumbers();
    } catch (error) {
        console.error("Error adding question:", error);
        alert("Failed to add question.");
    }
}

async function deleteQuestion(questionId) {
    try {
        if (testState.questions.size <= 1) {
            alert("You must have at least one question.");
            return;
        }
        if (confirm("Are you sure you want to delete this question?")) {
            await deleteDoc(doc(db, `tests/${testId}/questions`, questionId));
            testState.questions.delete(questionId);
            const cardElement = document.querySelector(`.question-card[data-question-id="${questionId}"]`);
            if (cardElement) {
                cardElement.remove();
            }
            await updateQuestionOrder();
        }
    } catch (error) {
        console.error("Error deleting question:", error);
        alert("Failed to delete question.");
    }
}

async function updateQuestionOrder() {
    try {
        const batch = writeBatch(db);
        const cards = Array.from(questionBuilder?.querySelectorAll('.question-card') || []);
        cards.forEach((card, index) => {
            const questionId = card.dataset.questionId;
            const question = testState.questions.get(questionId);
            if (question && question.order !== index) {
                question.order = index;
                batch.update(doc(db, `tests/${testId}/questions`, questionId), { order: index });
            }
        });
        await batch.commit();
        updateQuestionNumbers();
    } catch (error) {
        console.error("Error updating question order:", error);
    }
}

function updateQuestionNumbers() {
    if (!questionBuilder) return;
    questionBuilder.querySelectorAll('.question-card').forEach((card, index) => {
        const h3 = card.querySelector('h3');
        if (h3) {
            h3.textContent = `Question ${index + 1}`;
        }
    });
}

// --- AUTOSAVE FUNCTIONALITY ---
function handleAutosave(e) {
    const card = e.target.closest('.question-card');
    if (card) {
        debounceSave(() => saveQuestionState(card), 2000);
    }
}

async function saveQuestionState(card) {
    try {
        const questionId = card.dataset.questionId;
        const question = testState.questions.get(questionId);
        if (!question) return;

        const questionTextEl = card.querySelector('.question-text');
        const questionTypeEl = card.querySelector('.question-type-select');
        const requiredToggleEl = card.querySelector('.required-toggle');
        const manualGradeToggleEl = card.querySelector('.manual-grade-toggle');

        if (questionTextEl) question.questionText = questionTextEl.value;
        if (questionTypeEl) question.questionType = questionTypeEl.value;
        if (requiredToggleEl) question.isRequired = requiredToggleEl.checked;
        if (manualGradeToggleEl) question.isManualGrade = manualGradeToggleEl.checked;

        if (question.questionType === 'multiple-choice') {
            const optionTexts = card.querySelectorAll('.option-text');
            question.options = Array.from(optionTexts).map(input => input.value);
            const correctRadio = card.querySelector(`input[name="correct-option-${questionId}"]:checked`);
            question.correctAnswerIndex = correctRadio ? parseInt(correctRadio.value) : null;
        } else if (question.questionType === 'short-answer') {
            const answerTexts = card.querySelectorAll('.answer-text');
            question.validAnswers = Array.from(answerTexts).map(input => input.value);
        }
        
        await updateDoc(doc(db, `tests/${testId}/questions`, questionId), question);
    } catch (error) {
        console.error("Autosave failed:", error);
    }
}

// --- MODAL MANAGEMENT ---
async function openSummaryModal() {
    try {
        if (!summaryModal) return;

        const savePromises = Array.from(questionBuilder?.querySelectorAll('.question-card') || [])
            .map(card => saveQuestionState(card));
        await Promise.all(savePromises);

        let totalMarks = 0;
        testState.questions.forEach(q => { totalMarks += (q.marks || 1); });

        if (summaryTitleInput) summaryTitleInput.value = testState.title || 'Untitled Test';
        if (summaryDescription) summaryDescription.innerHTML = testState.description || '';
        if (summaryTestCode) summaryTestCode.textContent = testState.testCode || 'Will be generated on publish';
        if (summaryQuestions) summaryQuestions.textContent = testState.questions.size;
        if (summaryMarks) summaryMarks.textContent = totalMarks;
        if (shuffleToggle) shuffleToggle.checked = testState.shuffleQuestions || false;

        summaryModal.classList.add('active');
    } catch (error) {
        console.error("Error opening summary modal:", error);
        alert("Failed to open summary modal.");
    }
}

function closeSummaryModal() {
    if (summaryModal) {
        summaryModal.classList.remove('active');
    }
}

// --- TEST FINALIZATION ---
async function finalizeTest(status, scheduledTime = null) {
    try {
        // Update title from summary modal
        if (summaryTitleInput && summaryTitleInput.value.trim()) {
            testState.title = summaryTitleInput.value.trim();
            if (testTitleInput) {
                testTitleInput.value = testState.title;
            }
        }

        const testRef = doc(db, "tests", testId);
        
        let testCode = testState.testCode;
        if (!testCode && status === 'published') {
            testCode = `T-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        }

        const finalData = {
            title: testState.title,
            description: summaryDescription?.innerHTML || '',
            status: status,
            questionCount: testState.questions.size,
            shuffleQuestions: shuffleToggle?.checked || false,
            testCode: testCode,
            updatedAt: serverTimestamp()
        };

        if (scheduledTime) {
            finalData.scheduledPublishTime = scheduledTime;
        }

        await updateDoc(testRef, finalData);
        alert(`Test successfully ${status === 'published' ? 'published' : (status === 'scheduled' ? 'scheduled' : 'saved')}!`);
        window.location.href = `group.html?id=${groupId}`;
    } catch (error) {
        console.error("Error finalizing test:", error);
        alert("Failed to finalize test.");
    }
}

// --- EVENT LISTENERS SETUP (Fixed - renamed to match function call) ---
function setupEventListeners() {
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => signOut(auth));
    }
    
    if (addQuestionFab) {
        addQuestionFab.addEventListener('click', addQuestion);
    }
    
    if (reviewBtn) {
        reviewBtn.addEventListener('click', openSummaryModal);
    }
    
    if (summaryModalClose) {
        summaryModalClose.addEventListener('click', closeSummaryModal);
    }
    
    if (backToEditingBtn) {
        backToEditingBtn.addEventListener('click', closeSummaryModal);
    }
    
    if (testTitleInput) {
        testTitleInput.addEventListener('input', () => {
            testState.title = testTitleInput.value;
            debounceSave(() => updateDoc(doc(db, "tests", testId), { title: testState.title }), 1500);
        });
    }

    // Publish dropdown event listeners
    if (publishMainBtn) {
        publishMainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (publishDropdown && publishDropdown.classList.contains('active')) {
                closePublishDropdown();
            } else {
                openPublishDropdown();
            }
        });
        
        // Also show on hover for desktop
        if (publishDropdown) {
            publishDropdown.addEventListener('mouseenter', () => {
                if (window.innerWidth > 768) {
                    openPublishDropdown();
                }
            });
            
            publishDropdown.addEventListener('mouseleave', () => {
                if (window.innerWidth > 768) {
                    setTimeout(() => {
                        if (!publishDropdown.matches(':hover')) {
                            closePublishDropdown();
                        }
                    }, 300);
                }
            });
        }
    }
    
    if (publishNowBtn) {
        publishNowBtn.addEventListener('click', () => {
            closePublishDropdown();
            finalizeTest('published');
        });
    }
    
    if (schedulePublishBtn) {
        schedulePublishBtn.addEventListener('click', () => {
            showScheduleContainer();
        });
    }
    
    if (confirmScheduleBtn) {
        confirmScheduleBtn.addEventListener('click', () => {
            if (scheduleDateTimeInput) {
                const scheduledTime = new Date(scheduleDateTimeInput.value);
                if (isNaN(scheduledTime)) {
                    alert("Please select a valid date and time.");
                    return;
                }
                if (scheduledTime <= new Date()) {
                    alert("Please select a future date and time.");
                    return;
                }
                finalizeTest('scheduled', scheduledTime);
            }
        });
    }
    
    if (cancelScheduleBtn) {
        cancelScheduleBtn.addEventListener('click', () => {
            hideScheduleContainer();
            if (scheduleDateTimeInput) {
                scheduleDateTimeInput.value = '';
            }
        });
    }

    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', () => finalizeTest('draft'));
    }

    // Question builder event listeners
    if (questionBuilder) {
        questionBuilder.addEventListener('input', handleAutosave);
        questionBuilder.addEventListener('change', handleAutosave);

        questionBuilder.addEventListener('click', (e) => {
            const target = e.target;
            const card = target.closest('.question-card');
            if (!card) return;
            const questionId = card.dataset.questionId;

            if (target.closest('.delete')) {
                deleteQuestion(questionId);
            } else if (target.classList.contains('add-option-btn')) {
                const question = testState.questions.get(questionId);
                if (question && question.questionType === 'multiple-choice') {
                    question.options = question.options || [];
                    question.options.push('');
                    handleQuestionTypeChange(card, 'multiple-choice');
                }
            } else if (target.classList.contains('remove-option-btn')) {
                const optionRow = target.closest('.option-row');
                const question = testState.questions.get(questionId);
                if (question && optionRow) {
                    const optionIndex = Array.from(optionRow.parentNode.children).indexOf(optionRow);
                    question.options.splice(optionIndex, 1);
                    handleQuestionTypeChange(card, 'multiple-choice');
                }
            } else if (target.classList.contains('add-answer-btn')) {
                const question = testState.questions.get(questionId);
                if (question && question.questionType === 'short-answer') {
                    question.validAnswers = question.validAnswers || [];
                    question.validAnswers.push('');
                    handleQuestionTypeChange(card, 'short-answer');
                }
            } else if (target.classList.contains('remove-answer-btn')) {
                const answerRow = target.closest('.answer-row');
                const question = testState.questions.get(questionId);
                if (question && answerRow) {
                    const answerIndex = Array.from(answerRow.parentNode.children).indexOf(answerRow);
                    question.validAnswers.splice(answerIndex, 1);
                    handleQuestionTypeChange(card, 'short-answer');
                }
            }
        });

        // Handle question type change
        questionBuilder.addEventListener('change', (e) => {
            if (e.target.classList.contains('question-type-select')) {
                const card = e.target.closest('.question-card');
                if (card) {
                    handleQuestionTypeChange(card, e.target.value);
                }
            }
        });
    }

    if (summaryToolbar) {
        summaryToolbar.addEventListener('click', (e) => {
            const command = e.target.closest('button')?.dataset.command;
            if (command) {
                document.execCommand(command, false, null);
                if (summaryDescription) summaryDescription.focus();
            }
        });
    }

    // Handle window resize to reposition dropdown if open
    window.addEventListener('resize', () => {
        if (publishDropdown && publishDropdown.classList.contains('active')) {
            closePublishDropdown();
        }
    });
}