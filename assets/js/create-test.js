// --- FIREBASE IMPORTS ---
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, getDoc, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM ELEMENT SELECTION ---
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');
const backToGroupLink = document.getElementById('back-to-group-link');
const testTitleInput = document.getElementById('test-title-input');
const testStatusBadge = document.getElementById('test-status-badge');
const reviewBtn = document.getElementById('review-btn');
const questionBuilder = document.getElementById('question-builder');
const addQuestionBtn = document.getElementById('add-question-btn');

// Modal Elements
const summaryModal = document.getElementById('summary-modal-overlay');
const summaryModalClose = document.getElementById('summary-modal-close');
const summaryTitle = document.getElementById('summary-title');
const summaryDescription = document.getElementById('summary-description');
const summaryTestCode = document.getElementById('summary-test-code');
const summaryQuestions = document.getElementById('summary-questions');
const summaryMarks = document.getElementById('summary-marks');
const saveDraftBtn = document.getElementById('save-draft-btn');
const publishBtn = document.getElementById('publish-btn');


let currentUser;
let testId;
let groupId;
let testData;

// --- INITIALIZATION ---
const init = () => {
    const urlParams = new URLSearchParams(window.location.search);
    testId = urlParams.get('testId');
    groupId = urlParams.get('groupId'); // Make sure to get groupId as well

    if (!testId || !groupId) {
        alert('Missing test or group information. Redirecting...');
        window.location.href = 'dashboard.html';
        return;
    }
    backToGroupLink.href = `group.html?id=${groupId}`;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            userDisplayName.textContent = user.displayName || user.email;
            loadTestData();
        } else {
            window.location.href = 'index.html';
        }
    });
};

// --- DATA FETCHING & RENDERING ---
const loadTestData = async () => {
    const testRef = doc(db, "tests", testId);
    const testDoc = await getDoc(testRef);
    if (!testDoc.exists()) {
        alert("Test not found.");
        window.location.href = `group.html?id=${groupId}`;
        return;
    }
    testData = testDoc.data();
    
    // Populate header
    testTitleInput.value = testData.title;
    testStatusBadge.textContent = testData.status.charAt(0).toUpperCase() + testData.status.slice(1);
    
    // Load existing questions
    loadQuestions();
};

const loadQuestions = async () => {
    questionBuilder.innerHTML = '';
    const q = query(collection(db, `tests/${testId}/questions`));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        // If there are no questions, add one by default
        addQuestion(); 
    } else {
        querySnapshot.forEach(doc => renderQuestionCard(doc.id, doc.data()));
    }
};

const renderQuestionCard = (questionId, questionData) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.questionId = questionId;

    let optionsHTML = '';
    for (let i = 0; i < 4; i++) {
        optionsHTML += `
            <div class="option-input-group">
                <input type="radio" name="correct-option-${questionId}" value="${i}" ${questionData.correctAnswerIndex === i ? 'checked' : ''}>
                <input type="text" class="neu-input option-text" placeholder="Option ${i + 1}" value="${questionData.options[i] || ''}">
            </div>
        `;
    }

    card.innerHTML = `
        <div class="question-header">
            <h3>Question ${questionBuilder.children.length + 1}</h3>
            <button class="delete-question-btn">&times;</button>
        </div>
        <div class="question-body">
            <textarea class="neu-input question-text" placeholder="Enter your question here...">${questionData.questionText || ''}</textarea>
            <div class="options-grid">${optionsHTML}</div>
        </div>
        <div class="question-footer">
            <div class="mark-input-group">
                <label>Marks</label>
                <input type="number" class="neu-input marks" value="${questionData.marks || 1}" min="1">
            </div>
            <div class="mark-input-group">
                <label>Negative Marks</label>
                <input type="number" class="neu-input negative-marks" value="${questionData.negativeMarks || 0}" min="0">
            </div>
        </div>
    `;
    questionBuilder.appendChild(card);
};

// --- CORE FUNCTIONALITY ---

const addQuestion = async () => {
    const defaultMarks = questionBuilder.children.length > 0
        ? questionBuilder.lastChild.querySelector('.marks').value
        : 1;

    const newQuestion = {
        questionText: "",
        options: ["", "", "", ""],
        correctAnswerIndex: null,
        marks: parseInt(defaultMarks),
        negativeMarks: 0
    };
    const questionRef = await addDoc(collection(db, `tests/${testId}/questions`), newQuestion);
    renderQuestionCard(questionRef.id, newQuestion);
};


// --- AUTOSAVE LOGIC ---
let debounceTimer;
const debounce = (func, delay) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
};

questionBuilder.addEventListener('input', (e) => {
    const questionCard = e.target.closest('.question-card');
    if (questionCard) {
        debounce(() => saveQuestion(questionCard), 2000); // Autosave after 2s of inactivity
    }
});
testTitleInput.addEventListener('input', () => {
    debounce(() => updateDoc(doc(db, "tests", testId), { title: testTitleInput.value }), 2000);
});

const saveQuestion = (questionCard) => {
    const questionId = questionCard.dataset.questionId;
    const questionRef = doc(db, `tests/${testId}/questions`, questionId);
    
    const options = Array.from(questionCard.querySelectorAll('.option-text')).map(input => input.value);
    const correctOption = questionCard.querySelector(`input[name="correct-option-${questionId}"]:checked`);

    const updatedData = {
        questionText: questionCard.querySelector('.question-text').value,
        options: options,
        correctAnswerIndex: correctOption ? parseInt(correctOption.value) : null,
        marks: parseInt(questionCard.querySelector('.marks').value),
        negativeMarks: parseInt(questionCard.querySelector('.negative-marks').value)
    };

    updateDoc(questionRef, updatedData)
        .then(() => console.log(`Question ${questionId} saved.`))
        .catch(err => console.error("Error saving question:", err));
};

// --- EVENT LISTENERS ---
addQuestionBtn.addEventListener('click', addQuestion);

logoutBtn.addEventListener('click', () => signOut(auth));

reviewBtn.addEventListener('click', async () => {
    // Logic to populate and show the summary modal
    const q = query(collection(db, `tests/${testId}/questions`));
    const querySnapshot = await getDocs(q);
    let totalMarks = 0;
    querySnapshot.forEach(doc => {
        totalMarks += doc.data().marks || 0;
    });

    summaryTitle.textContent = testTitleInput.value;
    summaryDescription.value = testData.description || '';
    summaryTestCode.textContent = testData.testCode || 'Will be generated on publish';
    summaryQuestions.textContent = querySnapshot.size;
    summaryMarks.textContent = totalMarks;

    summaryModal.classList.add('active');
});

summaryModalClose.addEventListener('click', () => summaryModal.classList.remove('active'));

const finalizeTest = async (status) => {
    const testRef = doc(db, "tests", testId);
    const q = query(collection(db, `tests/${testId}/questions`));
    const querySnapshot = await getDocs(q);
    let totalMarks = 0;
    querySnapshot.forEach(doc => { totalMarks += doc.data().marks || 0; });
    
    let testCode = testData.testCode;
    if (!testCode && status === 'published') {
        testCode = `T-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    await updateDoc(testRef, {
        title: testTitleInput.value,
        description: summaryDescription.value,
        status: status,
        questionCount: querySnapshot.size,
        totalMarks: totalMarks,
        testCode: testCode,
        updatedAt: serverTimestamp()
    });

    alert(`Test successfully saved as ${status}!`);
    window.location.href = `group.html?id=${groupId}`;
};

saveDraftBtn.addEventListener('click', () => finalizeTest('draft'));
publishBtn.addEventListener('click', () => finalizeTest('published'));

// --- RUN SCRIPT ---
init();
