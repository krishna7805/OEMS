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
const summaryTitle = document.getElementById('summary-title');
const summaryDescription = document.getElementById('summary-description');
const summaryToolbar = document.getElementById('summary-toolbar');
const summaryTestCode = document.getElementById('summary-test-code');
const summaryQuestions = document.getElementById('summary-questions');
const summaryMarks = document.getElementById('summary-marks');
const shuffleToggle = document.getElementById('shuffle-questions-toggle');
const saveDraftBtn = document.getElementById('save-draft-btn');
const publishBtn = document.getElementById('publish-btn');
const scheduleBtnToggle = document.getElementById('schedule-btn-toggle');
const scheduleContainer = document.getElementById('schedule-container');
const scheduleDateTimeInput = document.getElementById('schedule-datetime');
const scheduleBtn = document.getElementById('schedule-btn');

// --- STATE MANAGEMENT ---
let currentUser, testId, groupId;
let testState = { questions: new Map() };
let debounceTimer;

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
        backToGroupLink.href = `groups.html?id=${groupId}`;
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

    addEventListeners();
});

async function checkPermissionsAndLoadData() {
    try {
        const groupRef = doc(db, 'groups', groupId);
        const groupDoc = await getDoc(groupRef);
        if (!groupDoc.exists() || groupDoc.data().ownerId !== currentUser.uid) {
            alert("You are not authorized to edit tests in this group.");
            window.location.href = `groups.html?id=${groupId}`;
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
            window.location.href = `groups.html?id=${groupId}`;
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
                ${options.length > 2 ? '<button class="remove-option-btn" title="Remove Option">&times;</button>' : ''}
            </div>
        `).join('');
        questionBodyHTML = `<div class="mc-options-list">${optionsHTML}</div><button class="add-option-btn">+ Add Option</button>`;
    } else if (question.questionType === 'short-answer') {
        const answers = question.validAnswers || [''];
        const answersHTML = answers.map(ans => `
            <div class="answer-row">
                <input type="text" class="neu-input answer-text" placeholder="Valid Answer" value="${escapeHtml(ans)}">
                <button class="remove-answer-btn" title="Remove Answer">&times;</button>
            </div>
        `).join('');
        questionBodyHTML = `<div class="sa-answers-list">${answersHTML}</div><button class="add-answer-btn">+ Add another valid answer</button>`;
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
                <button class="btn-icon move-up" title="Move Up">▲</button>
                <button class="btn-icon move-down" title="Move Down">▼</button>
                <button class="btn-icon delete" title="Delete Question">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `;
    questionBuilder.appendChild(card);
}

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

const debounceSave = (func, delay) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
};

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

async function openSummaryModal() {
    try {
        if (!summaryModal) return;

        const savePromises = Array.from(questionBuilder?.querySelectorAll('.question-card') || [])
            .map(card => saveQuestionState(card));
        await Promise.all(savePromises);

        let totalMarks = 0;
        testState.questions.forEach(q => { totalMarks += (q.marks || 1); });

        if (summaryTitle) summaryTitle.textContent = testState.title;
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

async function finalizeTest(status, scheduledTime = null) {
    try {
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
        window.location.href = `groups.html?id=${groupId}`;
    } catch (error) {
        console.error("Error finalizing test:", error);
        alert("Failed to finalize test.");
    }
}

function addEventListeners() {
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
        summaryModalClose.addEventListener('click', () => {
            if (summaryModal) summaryModal.classList.remove('active');
        });
    }
    
    if (testTitleInput) {
        testTitleInput.addEventListener('input', () => {
            testState.title = testTitleInput.value;
            debounceSave(() => updateDoc(doc(db, "tests", testId), { title: testState.title }), 1500);
        });
    }

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
            }
        });
    }

    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', () => finalizeTest('draft'));
    }
    
    if (publishBtn) {
        publishBtn.addEventListener('click', () => finalizeTest('published'));
    }
    
    if (scheduleBtnToggle) {
        scheduleBtnToggle.addEventListener('click', () => {
            if (scheduleContainer) {
                scheduleContainer.style.display = scheduleContainer.style.display === 'flex' ? 'none' : 'flex';
            }
        });
    }
    
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', () => {
            if (scheduleDateTimeInput) {
                const scheduledTime = new Date(scheduleDateTimeInput.value);
                if (isNaN(scheduledTime)) return alert("Invalid date/time format.");
                finalizeTest('scheduled', scheduledTime);
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
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const p = document.createElement("p");
    p.textContent = str;
    return p.innerHTML;
}