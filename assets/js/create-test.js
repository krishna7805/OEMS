import { auth, db, storage } from './firebase-config.js';
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
import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- DOM ELEMENT SELECTION ---
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');
const backToGroupLink = document.getElementById('back-to-group-link');
const testTitleInput = document.getElementById('test-title-input');
const testStatusBadge = document.getElementById('test-status-badge');
const testCodeDisplay = document.getElementById('test-code-display');
const reviewBtn = document.getElementById('review-btn');
const questionBuilder = document.getElementById('question-builder');
const addQuestionBtn = document.getElementById('add-question-btn');
const questionTypeMenu = document.getElementById('question-type-menu');

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
let currentEditingQuestion = null;

// --- UTILITY FUNCTIONS ---
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const p = document.createElement("p");
    p.textContent = str;
    return p.innerHTML;
}

function generateTestCode() {
    return `T-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// --- DROPDOWN MANAGEMENT FUNCTIONS ---
function openPublishDropdown() {
    if (publishDropdown && publishDropdownMenu) {
        publishDropdown.classList.add('active');
        const dropdownRect = publishDropdownMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const buttonRect = publishMainBtn.getBoundingClientRect();
        publishDropdownMenu.classList.remove('align-left');
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

// --- RICH TEXT EDITOR FUNCTIONS ---
function initRichTextEditor(editableDiv) {
    editableDiv.addEventListener('focus', () => {
        const toolbar = editableDiv.previousElementSibling;
        if (toolbar && toolbar.classList.contains('question-toolbar')) {
            toolbar.style.display = 'flex';
        }
    });

    editableDiv.addEventListener('blur', () => {
        setTimeout(() => {
            const toolbar = editableDiv.previousElementSibling;
            if (toolbar && toolbar.classList.contains('question-toolbar')) {
                toolbar.style.display = 'none';
            }
        }, 200);
    });
}

function execCommand(command, value = null) {
    document.execCommand(command, false, value);
}

// --- IMAGE UPLOAD FUNCTIONS ---
async function handleQuestionImageUpload(questionId, file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }

    try {
        const storageRef = ref(storage, `test-images/${testId}/${questionId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);

        const question = testState.questions.get(questionId);
        if (question) {
            question.imageUrl = imageUrl;
            await updateDoc(doc(db, `tests/${testId}/questions`, questionId), { imageUrl });
            
            const card = document.querySelector(`.question-card[data-question-id="${questionId}"]`);
            if (card) {
                updateQuestionImage(card, imageUrl);
            }
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image.');
    }
}

function updateQuestionImage(card, imageUrl) {
    let imageContainer = card.querySelector('.question-image-container');
    if (!imageContainer) {
        imageContainer = document.createElement('div');
        imageContainer.className = 'question-image-container';
        const questionBody = card.querySelector('.question-body');
        questionBody.insertBefore(imageContainer, questionBody.firstChild);
    }

    imageContainer.innerHTML = `
        <img src="${imageUrl}" alt="Question image" class="question-image">
        <button type="button" class="remove-image-btn" title="Remove image">&times;</button>
    `;
}

// --- INITIALIZATION & SECURITY ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("create-test.js: Page loaded");

    testId = localStorage.getItem('current_edit_test_id');
    groupId = localStorage.getItem('current_edit_group_id');
    
    if (!testId || !groupId) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTestId = urlParams.get('testId');
        const urlGroupId = urlParams.get('groupId');
        
        if (urlTestId && urlGroupId) {
            testId = urlTestId;
            groupId = urlGroupId;
            localStorage.setItem('current_edit_test_id', testId);
            localStorage.setItem('current_edit_group_id', groupId);
        }
    }

    if (!testId || !groupId) {
        alert('Missing test or group information. Redirecting...');
        window.location.href = 'dashboard.html';
        return;
    }
    
    if (backToGroupLink) {
        backToGroupLink.href = `group.html?id=${groupId}`;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        
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

        // Generate test code if it doesn't exist
        if (!testState.testCode) {
            testState.testCode = generateTestCode();
            await updateDoc(testRef, { testCode: testState.testCode });
        }
        
        if (testTitleInput) {
            testTitleInput.value = testState.title || 'Untitled Test';
        }

        if (testCodeDisplay) {
            testCodeDisplay.textContent = testState.testCode;
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
                // Don't auto-create a question
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
        'short-answer': 'Short Answer',
        'ranking': 'Ranking',
        'likert': 'Likert Scale'
    };

    let questionBodyHTML = '';
    
    // Add image if exists
    const imageHTML = question.imageUrl ? `
        <div class="question-image-container">
            <img src="${question.imageUrl}" alt="Question image" class="question-image">
            <button type="button" class="remove-image-btn" title="Remove image">&times;</button>
        </div>
    ` : '';

    if (question.questionType === 'multiple-choice') {
        const options = question.options || ['', ''];
        const optionsHTML = options.map((opt, i) => `
            <div class="option-row">
                <input type="radio" name="correct-option-${question.id}" value="${i}" ${question.correctAnswerIndex === i ? 'checked' : ''}>
                <input type="text" class="neu-input option-text" placeholder="Option ${i + 1}" value="${escapeHtml(opt)}">
                ${options.length > 1 ? '<button type="button" class="remove-option-btn" title="Remove Option">&times;</button>' : ''}
            </div>
        `).join('');
        questionBodyHTML = `
            <div class="mc-options-list">${optionsHTML}</div>
            <button type="button" class="add-option-btn">+ Add Option</button>
        `;
    } else if (question.questionType === 'short-answer') {
        const gradingType = question.gradingType || 'auto';
        const answers = question.correctAnswers || [''];
        const answersHTML = gradingType === 'auto' ? answers.map((ans, i) => `
            <div class="answer-row">
                <input type="text" class="neu-input answer-text" placeholder="Valid Answer ${i + 1}" value="${escapeHtml(ans)}">
                ${answers.length > 1 ? '<button type="button" class="remove-answer-btn" title="Remove Answer">&times;</button>' : ''}
            </div>
        `).join('') : '<p class="manual-grading-note">This question will be graded manually.</p>';
        
        questionBodyHTML = `
            <div class="grading-toggle-container">
                <label class="toggle-switch-container">
                    <span>Manual Grading</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="manual-grading-toggle" ${gradingType === 'manual' ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </label>
            </div>
            <div class="sa-answers-container">
                <div class="sa-answers-list">${answersHTML}</div>
                ${gradingType === 'auto' ? '<button type="button" class="add-answer-btn">+ Add another valid answer</button>' : ''}
            </div>
        `;
    } else if (question.questionType === 'ranking') {
        const items = question.rankingItems || ['', ''];
        const itemsHTML = items.map((item, i) => `
            <div class="ranking-item-row">
                <span class="rank-number">${i + 1}</span>
                <input type="text" class="neu-input ranking-item-text" placeholder="Item ${i + 1}" value="${escapeHtml(item)}">
                ${items.length > 2 ? '<button type="button" class="remove-ranking-item-btn" title="Remove Item">&times;</button>' : ''}
            </div>
        `).join('');
        questionBodyHTML = `
            <div class="ranking-items-list">${itemsHTML}</div>
            <button type="button" class="add-ranking-item-btn">+ Add Item</button>
        `;
    } else if (question.questionType === 'likert') {
        const scale = question.likertScale || 5;
        questionBodyHTML = `
            <div class="likert-container">
                <label>Scale Points:</label>
                <select class="neu-input likert-scale-select">
                    <option value="3" ${scale === 3 ? 'selected' : ''}>3-point</option>
                    <option value="5" ${scale === 5 ? 'selected' : ''}>5-point</option>
                    <option value="7" ${scale === 7 ? 'selected' : ''}>7-point</option>
                </select>
            </div>
        `;
    }

    const shuffleOptionsHTML = question.questionType === 'multiple-choice' ? `
        <div class="toggle-switch-container">
            <label class="toggle-switch" title="Shuffle options for this question">
                <input type="checkbox" class="shuffle-options-toggle" ${question.shuffleOptions ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 3 21 3 21 8"></polyline>
                <line x1="4" y1="20" x2="21" y2="3"></line>
                <polyline points="21 16 21 21 16 21"></polyline>
                <line x1="15" y1="15" x2="21" y2="21"></line>
                <line x1="4" y1="4" x2="9" y2="9"></line>
            </svg>
        </div>
    ` : '';

    card.innerHTML = `
        <div class="question-header">
            <h3>Question ${(question.order || 0) + 1}</h3>
            <select class="neu-input question-type-select">
                ${Object.entries(questionTypes).map(([value, text]) => 
                    `<option value="${value}" ${question.questionType === value ? 'selected' : ''}>${text}</option>`
                ).join('')}
            </select>
            <button type="button" class="btn-icon upload-image" title="Upload Image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="9" cy="9" r="2"></circle>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
                </svg>
            </button>
            <input type="file" class="image-upload-input" accept="image/*" style="display:none;">
            <button type="button" class="btn-icon delete" title="Delete Question">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
        <div class="question-body">
            ${imageHTML}
            <div class="question-text-editor">
                <div class="question-toolbar" style="display: none;">
                    <button type="button" data-command="bold" title="Bold"><b>B</b></button>
                    <button type="button" data-command="italic" title="Italic"><i>I</i></button>
                    <button type="button" data-command="underline" title="Underline"><u>U</u></button>
                    <button type="button" data-command="removeFormat" title="Clear formatting">✕</button>
                </div>
                <div class="question-text" contenteditable="true" placeholder="Enter your question here...">${question.questionText || ''}</div>
            </div>
            <div class="question-specific-body">${questionBodyHTML}</div>
        </div>
        <div class="question-footer">
            <div class="footer-left">
                <div class="marks-input-group">
                    <label>Marks:</label>
                    <input type="number" class="neu-input marks-input" min="0" value="${question.marks || 1}">
                </div>
                <div class="marks-input-group">
                    <label>Negative:</label>
                    <input type="number" class="neu-input negative-marks-input" min="0" step="0.25" value="${question.negativeMarks || 0}">
                </div>
            </div>
            <div class="footer-right">
                ${shuffleOptionsHTML}
                <button type="button" class="btn-icon move-up" title="Move Up">▲</button>
                <button type="button" class="btn-icon move-down" title="Move Down">▼</button>
            </div>
        </div>
    `;
    
    questionBuilder.appendChild(card);
    
    // Initialize rich text editor
    const editableDiv = card.querySelector('.question-text');
    if (editableDiv) {
        initRichTextEditor(editableDiv);
    }
}

// --- QUESTION TYPE HANDLING ---
function handleQuestionTypeChange(card, newType) {
    const questionId = card.dataset.questionId;
    const question = testState.questions.get(questionId);
    if (!question) return;

    question.questionType = newType;
    
    const specificBody = card.querySelector('.question-specific-body');
    const footerRight = card.querySelector('.footer-right');
    if (!specificBody) return;

    let bodyHTML = '';
    let shuffleHTML = '';

    if (newType === 'multiple-choice') {
        const options = question.options || ['', ''];
        const optionsHTML = options.map((opt, i) => `
            <div class="option-row">
                <input type="radio" name="correct-option-${questionId}" value="${i}" ${question.correctAnswerIndex === i ? 'checked' : ''}>
                <input type="text" class="neu-input option-text" placeholder="Option ${i + 1}" value="${escapeHtml(opt)}">
                ${options.length > 1 ? '<button type="button" class="remove-option-btn" title="Remove Option">&times;</button>' : ''}
            </div>
        `).join('');
        bodyHTML = `
            <div class="mc-options-list">${optionsHTML}</div>
            <button type="button" class="add-option-btn">+ Add Option</button>
        `;
        shuffleHTML = `
            <div class="toggle-switch-container">
                <label class="toggle-switch" title="Shuffle options for this question">
                    <input type="checkbox" class="shuffle-options-toggle" ${question.shuffleOptions ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 3 21 3 21 8"></polyline>
                    <line x1="4" y1="20" x2="21" y2="3"></line>
                    <polyline points="21 16 21 21 16 21"></polyline>
                    <line x1="15" y1="15" x2="21" y2="21"></line>
                    <line x1="4" y1="4" x2="9" y2="9"></line>
                </svg>
            </div>
        `;
    } else if (newType === 'short-answer') {
        const gradingType = question.gradingType || 'auto';
        const answers = question.correctAnswers || [''];
        const answersHTML = gradingType === 'auto' ? answers.map((ans, i) => `
            <div class="answer-row">
                <input type="text" class="neu-input answer-text" placeholder="Valid Answer ${i + 1}" value="${escapeHtml(ans)}">
                ${answers.length > 1 ? '<button type="button" class="remove-answer-btn" title="Remove Answer">&times;</button>' : ''}
            </div>
        `).join('') : '<p class="manual-grading-note">This question will be graded manually.</p>';
        
        bodyHTML = `
            <div class="grading-toggle-container">
                <label class="toggle-switch-container">
                    <span>Manual Grading</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="manual-grading-toggle" ${gradingType === 'manual' ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </label>
            </div>
            <div class="sa-answers-container">
                <div class="sa-answers-list">${answersHTML}</div>
                ${gradingType === 'auto' ? '<button type="button" class="add-answer-btn">+ Add another valid answer</button>' : ''}
            </div>
        `;
    } else if (newType === 'ranking') {
        const items = question.rankingItems || ['', ''];
        const itemsHTML = items.map((item, i) => `
            <div class="ranking-item-row">
                <span class="rank-number">${i + 1}</span>
                <input type="text" class="neu-input ranking-item-text" placeholder="Item ${i + 1}" value="${escapeHtml(item)}">
                ${items.length > 2 ? '<button type="button" class="remove-ranking-item-btn" title="Remove Item">&times;</button>' : ''}
            </div>
        `).join('');
        bodyHTML = `
            <div class="ranking-items-list">${itemsHTML}</div>
            <button type="button" class="add-ranking-item-btn">+ Add Item</button>
        `;
    } else if (newType === 'likert') {
        const scale = question.likertScale || 5;
        bodyHTML = `
            <div class="likert-container">
                <label>Scale Points:</label>
                <select class="neu-input likert-scale-select">
                    <option value="3" ${scale === 3 ? 'selected' : ''}>3-point</option>
                    <option value="5" ${scale === 5 ? 'selected' : ''}>5-point</option>
                    <option value="7" ${scale === 7 ? 'selected' : ''}>7-point</option>
                </select>
            </div>
        `;
    }
    
    specificBody.innerHTML = bodyHTML;
    
    // Update shuffle toggle
    const existingShuffleToggle = footerRight.querySelector('.shuffle-options-toggle')?.parentElement?.parentElement;
    if (existingShuffleToggle) {
        existingShuffleToggle.remove();
    }
    if (shuffleHTML) {
        const uploadBtn = footerRight.querySelector('.upload-image');
        uploadBtn.insertAdjacentHTML('beforebegin', shuffleHTML);
    }
    
    saveQuestionState(card);
}

// --- QUESTION MANAGEMENT ---
async function addQuestion(type = 'multiple-choice') {
    try {
        const order = testState.questions.size;
        const newQuestion = {
            questionText: "",
            questionType: type,
            options: type === 'multiple-choice' ? ["", ""] : [],
            correctAnswerIndex: null,
            correctAnswers: type === 'short-answer' ? [''] : [],
            gradingType: type === 'short-answer' ? 'auto' : null,
            rankingItems: type === 'ranking' ? ['', ''] : [],
            likertScale: type === 'likert' ? 5 : null,
            shuffleOptions: false,
            marks: 1,
            negativeMarks: 0,
            imageUrl: '',
            order: order
        };
        
        const questionRef = await addDoc(collection(db, `tests/${testId}/questions`), newQuestion);
        newQuestion.id = questionRef.id;
        testState.questions.set(newQuestion.id, newQuestion);
        renderQuestionCard(newQuestion);
        updateQuestionNumbers();
        
        // Close menu after adding
        if (questionTypeMenu) {
            questionTypeMenu.classList.remove('active');
        }
    } catch (error) {
        console.error("Error adding question:", error);
        alert("Failed to add question.");
    }
}

async function deleteQuestion(questionId) {
    try {
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

async function moveQuestion(card, direction) {
    const cards = Array.from(questionBuilder.querySelectorAll('.question-card'));
    const currentIndex = cards.indexOf(card);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= cards.length) return;
    
    if (direction === 'up') {
        questionBuilder.insertBefore(card, cards[newIndex]);
    } else {
        questionBuilder.insertBefore(card, cards[newIndex].nextSibling);
    }
    
    await updateQuestionOrder();
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
        const marksInput = card.querySelector('.marks-input');
        const negativeMarksInput = card.querySelector('.negative-marks-input');
        const shuffleOptionsToggle = card.querySelector('.shuffle-options-toggle');

        if (questionTextEl) question.questionText = questionTextEl.innerHTML;
        if (questionTypeEl) question.questionType = questionTypeEl.value;
        if (marksInput) question.marks = parseFloat(marksInput.value) || 1;
        if (negativeMarksInput) question.negativeMarks = parseFloat(negativeMarksInput.value) || 0;
        if (shuffleOptionsToggle) question.shuffleOptions = shuffleOptionsToggle.checked;

        if (question.questionType === 'multiple-choice') {
            const optionTexts = card.querySelectorAll('.option-text');
            question.options = Array.from(optionTexts).map(input => input.value);
            const correctRadio = card.querySelector(`input[name="correct-option-${questionId}"]:checked`);
            question.correctAnswerIndex = correctRadio ? parseInt(correctRadio.value) : null;
        } else if (question.questionType === 'short-answer') {
            const manualGradingToggle = card.querySelector('.manual-grading-toggle');
            question.gradingType = manualGradingToggle?.checked ? 'manual' : 'auto';
            if (question.gradingType === 'auto') {
                const answerTexts = card.querySelectorAll('.answer-text');
                question.correctAnswers = Array.from(answerTexts).map(input => input.value);
            }
        } else if (question.questionType === 'ranking') {
            const itemTexts = card.querySelectorAll('.ranking-item-text');
            question.rankingItems = Array.from(itemTexts).map(input => input.value);
        } else if (question.questionType === 'likert') {
            const scaleSelect = card.querySelector('.likert-scale-select');
            question.likertScale = scaleSelect ? parseInt(scaleSelect.value) : 5;
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
        if (summaryTestCode) summaryTestCode.textContent = testState.testCode || 'Not generated';
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
        if (summaryTitleInput && summaryTitleInput.value.trim()) {
            testState.title = summaryTitleInput.value.trim();
            if (testTitleInput) {
                testTitleInput.value = testState.title;
            }
        }

        const testRef = doc(db, "tests", testId);

        const finalData = {
            title: testState.title,
            description: summaryDescription?.innerHTML || '',
            status: status,
            questionCount: testState.questions.size,
            shuffleQuestions: shuffleToggle?.checked || false,
            testCode: testState.testCode,
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

// --- EVENT LISTENERS SETUP ---
// ...existing code...

function setupEventListeners() {
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => signOut(auth));
    }
    
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (questionTypeMenu) {
                questionTypeMenu.classList.toggle('active');
            }
        });
    }

    if (questionTypeMenu) {
        questionTypeMenu.addEventListener('click', async (e) => {
            const typeBtn = e.target.closest('[data-type]');
            if (typeBtn) {
                const type = typeBtn.dataset.type;
                await addQuestion(type);
                
                // Set the newly created question to editing mode
                const allCards = questionBuilder.querySelectorAll('.question-card');
                const newCard = allCards[allCards.length - 1];
                if (newCard) {
                    document.querySelectorAll('.question-card.is-editing').forEach(c => c.classList.remove('is-editing'));
                    newCard.classList.add('is-editing');
                }
                
                // Close the menu
                questionTypeMenu.classList.remove('active');
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!addQuestionBtn?.contains(e.target) && !questionTypeMenu?.contains(e.target)) {
                questionTypeMenu.classList.remove('active');
            }
        });
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

    if (publishMainBtn) {
        publishMainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (publishDropdown && publishDropdown.classList.contains('active')) {
                closePublishDropdown();
            } else {
                openPublishDropdown();
            }
        });
        
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

    if (questionBuilder) {
        questionBuilder.addEventListener('input', handleAutosave);
        questionBuilder.addEventListener('change', handleAutosave);

        questionBuilder.addEventListener('click', (e) => {
            const target = e.target;
            const card = target.closest('.question-card');
            if (!card) return;
            
            // Focus Mode Management: Only activate if not clicking on action buttons
            const isActionButton = target.closest('.delete, .move-up, .move-down, .upload-image, .remove-image-btn, .add-option-btn, .remove-option-btn, .add-answer-btn, .remove-answer-btn, .add-ranking-item-btn, .remove-ranking-item-btn, [data-command], .question-type-select, .manual-grading-toggle, .shuffle-options-toggle, .marks-input, .negative-marks-input, .option-text, .answer-text, .ranking-item-text, .likert-scale-select');
            
            if (!isActionButton) {
                // Remove is-editing from all cards
                document.querySelectorAll('.question-card.is-editing').forEach(c => c.classList.remove('is-editing'));
                // Add is-editing to clicked card
                card.classList.add('is-editing');
                return;
            }
            
            const questionId = card.dataset.questionId;

            if (target.closest('.delete')) {
                deleteQuestion(questionId);
            } else if (target.closest('.move-up')) {
                moveQuestion(card, 'up');
            } else if (target.closest('.move-down')) {
                moveQuestion(card, 'down');
            } else if (target.closest('.upload-image')) {
                const fileInput = card.querySelector('.image-upload-input');
                if (fileInput) fileInput.click();
            } else if (target.closest('.remove-image-btn')) {
                const question = testState.questions.get(questionId);
                if (question) {
                    question.imageUrl = '';
                    updateDoc(doc(db, `tests/${testId}/questions`, questionId), { imageUrl: '' });
                    const imageContainer = card.querySelector('.question-image-container');
                    if (imageContainer) imageContainer.remove();
                }
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
                    question.correctAnswers = question.correctAnswers || [];
                    question.correctAnswers.push('');
                    handleQuestionTypeChange(card, 'short-answer');
                }
            } else if (target.classList.contains('remove-answer-btn')) {
                const answerRow = target.closest('.answer-row');
                const question = testState.questions.get(questionId);
                if (question && answerRow) {
                    const answerIndex = Array.from(answerRow.parentNode.children).indexOf(answerRow);
                    question.correctAnswers.splice(answerIndex, 1);
                    handleQuestionTypeChange(card, 'short-answer');
                }
            } else if (target.classList.contains('add-ranking-item-btn')) {
                const question = testState.questions.get(questionId);
                if (question && question.questionType === 'ranking') {
                    question.rankingItems = question.rankingItems || [];
                    question.rankingItems.push('');
                    handleQuestionTypeChange(card, 'ranking');
                }
            } else if (target.classList.contains('remove-ranking-item-btn')) {
                const itemRow = target.closest('.ranking-item-row');
                const question = testState.questions.get(questionId);
                if (question && itemRow) {
                    const itemIndex = Array.from(itemRow.parentNode.children).indexOf(itemRow);
                    question.rankingItems.splice(itemIndex, 1);
                    handleQuestionTypeChange(card, 'ranking');
                }
            } else if (target.closest('[data-command]')) {
                const command = target.closest('[data-command]').dataset.command;
                execCommand(command);
            }
        });

        questionBuilder.addEventListener('change', (e) => {
            const target = e.target;
            const card = target.closest('.question-card');
            if (!card) return;

            if (target.classList.contains('question-type-select')) {
                handleQuestionTypeChange(card, target.value);
            } else if (target.classList.contains('manual-grading-toggle')) {
                handleQuestionTypeChange(card, 'short-answer');
            } else if (target.classList.contains('image-upload-input')) {
                const file = target.files[0];
                if (file) {
                    const questionId = card.dataset.questionId;
                    handleQuestionImageUpload(questionId, file);
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

    window.addEventListener('resize', () => {
        if (publishDropdown && publishDropdown.classList.contains('active')) {
            closePublishDropdown();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const questionList = document.querySelector(".question-list");
  const addQuestionBtn = document.querySelector(".add-question-btn");
  const questionTypeMenu = document.querySelector(".question-type-menu");

  // Focus Mode Management
  questionList.addEventListener("click", (event) => {
    const card = event.target.closest(".question-card");
    if (card && !card.classList.contains("is-editing")) {
      document.querySelectorAll(".question-card.is-editing").forEach((c) => c.classList.remove("is-editing"));
      card.classList.add("is-editing");
    }
  });

  // "+ Add Question" Workflow
  addQuestionBtn.addEventListener("click", () => {
    questionTypeMenu.style.display = questionTypeMenu.style.display === "none" ? "block" : "none";
  });

  questionTypeMenu.addEventListener("click", (event) => {
    if (event.target.classList.contains("question-type")) {
      const newCard = document.createElement("div");
      newCard.className = "question-card is-editing";
      newCard.innerHTML = `
        <div class="card-header">
          <h3 class="question-text">New Question</h3>
          <div class="icons">
            <svg class="gallery-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <!-- Gallery Icon SVG -->
            </svg>
            <svg class="delete-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <!-- Trash Can Icon SVG -->
            </svg>
          </div>
        </div>
        <div class="card-options">
          <ul>
            <li>Option 1</li>
            <li>Option 2</li>
          </ul>
        </div>
        <div class="card-actions" style="display: block;">
          <input type="number" class="points-input" placeholder="Points">
          <button class="move-up">Move Up</button>
          <button class="move-down">Move Down</button>
          <button class="delete">Delete</button>
        </div>
      `;
      questionList.insertBefore(newCard, document.querySelector(".add-question-section"));
      questionTypeMenu.style.display = "none";
    }
  });

  // Finalization and Redirection
  const groupId = new URLSearchParams(window.location.search).get("groupId");
  document.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Save operation logic here
      window.location.href = `/group/${groupId}`;
    });
  });
});