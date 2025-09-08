import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- APPLICATION STATE ---
const state = {
  groupId: null,
  currentUser: null,
  currentGroup: null,
  isOwner: false,
  isLoading: true
};

// --- DOM ELEMENTS ---
const elements = {
  userDisplay: document.getElementById('user-display-name'),
  logoutBtn: document.getElementById('logout-btn'),
  groupName: document.getElementById('group-name'),
  groupCode: document.getElementById('group-code'),
  ownerActions: document.getElementById('owner-actions'),
  createTestBtn: document.getElementById('create-test-btn'),
  testsList: document.getElementById('tests-list'),
  noTestsMessage: document.getElementById('no-tests-message'),
  membersList: document.getElementById('members-list'),
  noMembersMessage: document.getElementById('no-members-message')
};

// --- UTILITY FUNCTIONS ---
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function redirect(page) {
  window.location.href = page;
}

// --- CORE APP FUNCTIONS ---
async function init() {
  console.log("Initializing group page");
  
  state.groupId = getQueryParam('id');
  if (!state.groupId) {
    console.error("No group ID in URL");
    alert('No group ID specified.');
    redirect('dashboard.html');
    return;
  }

  onAuthStateChanged(auth, handleAuthStateChanged);
  setupEventListeners();
}

async function handleAuthStateChanged(user) {
  console.log("Auth state changed:", !!user);
  
  if (!user) {
    redirect('index.html');
    return;
  }

  state.currentUser = user;
  
  if (elements.userDisplay) {
    elements.userDisplay.textContent = user.displayName || user.email;
  }
  
  try {
    await loadGroupData();
  } catch (error) {
    console.error("Failed to load group data:", error);
    alert("Error loading group data. Please try again later.");
  }
}

async function loadGroupData() {
  console.log(`Loading data for group: ${state.groupId}`);
  try {
    const groupRef = doc(db, 'groups', state.groupId);
    const groupSnap = await getDoc(groupRef);
    
    if (!groupSnap.exists()) {
      console.error("Group document not found");
      alert('Group not found.');
      redirect('dashboard.html');
      return;
    }

    state.currentGroup = { 
      id: groupSnap.id, 
      ...groupSnap.data() 
    };
    
    state.isOwner = (state.currentUser.uid === state.currentGroup.ownerId);
    updateGroupUI();
    
    await Promise.all([
      loadTests(),
      loadMembers()
    ]);
    
    state.isLoading = false;
    
  } catch (error) {
    console.error("Error in loadGroupData:", error);
    throw error;
  }
}

function updateGroupUI() {
  if (!state.currentGroup) return;
  
  if (elements.groupName) {
    elements.groupName.textContent = escapeHtml(state.currentGroup.name);
  }
  
  if (elements.groupCode) {
    elements.groupCode.textContent = escapeHtml(state.currentGroup.code || '');
  }
  
  if (elements.ownerActions) {
    elements.ownerActions.style.display = state.isOwner ? 'block' : 'none';
  }
}

async function loadTests() {
  try {
    const testsQuery = query(
      collection(db, 'tests'), 
      where('groupId', '==', state.groupId)
    );
    
    const querySnapshot = await getDocs(testsQuery);
    
    if (elements.testsList) {
      elements.testsList.innerHTML = '';
      
      if (querySnapshot.empty) {
        if (elements.noTestsMessage) {
          elements.noTestsMessage.style.display = 'block';
        }
        return;
      }
      
      if (elements.noTestsMessage) {
        elements.noTestsMessage.style.display = 'none';
      }
      
      querySnapshot.forEach(doc => {
        const test = { id: doc.id, ...doc.data() };
        const testCard = createTestCard(test);
        elements.testsList.appendChild(testCard);
      });
    }
  } catch (error) {
    console.error("Error loading tests:", error);
    if (elements.noTestsMessage) {
      elements.noTestsMessage.textContent = "Failed to load tests. Please refresh the page.";
      elements.noTestsMessage.style.display = 'block';
    }
  }
}

function createTestCard(test) {
  const card = document.createElement('div');
  card.className = 'test-card';
  card.dataset.testId = test.id;

  const ownerButtons = state.isOwner ? `
    <div class="manage-buttons">
      <button class="btn-icon edit" title="Edit Test" data-action="edit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button class="btn-icon delete" title="Delete Test" data-action="delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  ` : '';

  card.innerHTML = `
    <div class="test-card-header">
      <h3 class="test-card-title">${escapeHtml(test.title)}</h3>
    </div>
    <p class="test-card-stats">${test.questionCount || 0} Questions • ${test.timeLimit || 'N/A'} min</p>
    <div class="test-card-actions">
      <button class="btn-primary" data-action="take">Take Test</button>
      ${ownerButtons}
    </div>
  `;
  return card;
}

async function loadMembers() {
  try {
    const ownerId = state.currentGroup.ownerId;
    if (!ownerId) {
      throw new Error("Group has no owner ID");
    }
    
    const memberIds = new Set([ownerId]);
    
    const membershipsQuery = query(
      collection(db, 'memberships'), 
      where('groupId', '==', state.groupId)
    );
    
    const querySnapshot = await getDocs(membershipsQuery);
    querySnapshot.forEach(doc => {
      const userId = doc.data().userId;
      if (userId) memberIds.add(userId);
    });
    
    if (elements.membersList) {
      elements.membersList.innerHTML = '';
      
      if (memberIds.size === 0) {
        if (elements.noMembersMessage) {
          elements.noMembersMessage.style.display = 'block';
        }
        return;
      }
      
      if (elements.noMembersMessage) {
        elements.noMembersMessage.style.display = 'none';
      }
      
      const memberPromises = Array.from(memberIds).map(uid => 
        getDoc(doc(db, 'users', uid))
      );
      
      const memberDocs = await Promise.all(memberPromises);
      
      memberDocs.forEach(userDoc => {
        if (userDoc.exists()) {
          const user = userDoc.data();
          const li = document.createElement('li');
          li.className = 'member-item';
          const displayName = user.fullName || user.displayName || user.email || 'User';
          li.textContent = escapeHtml(displayName);
          elements.membersList.appendChild(li);
        }
      });
    }
  } catch (error) {
    console.error("Error loading members:", error);
    if (elements.noMembersMessage) {
      elements.noMembersMessage.textContent = "Failed to load members. Please refresh the page.";
      elements.noMembersMessage.style.display = 'block';
    }
  }
}

async function handleCreateTest() {
  console.log("Create test button clicked");
  
  if (state.isLoading) {
    alert("Page is still loading. Please wait a moment.");
    return;
  }
  
  if (!state.currentUser || !state.currentGroup || !state.currentGroup.id) {
    console.error("Missing data for test creation:", { 
      user: !!state.currentUser, 
      group: state.currentGroup 
    });
    alert("Required data is missing. Please refresh the page and try again.");
    return;
  }
  
  if (!state.isOwner) {
    console.error("Non-owner attempting to create test");
    alert("Only the group owner can create tests.");
    return;
  }
  
  if (elements.createTestBtn) {
    elements.createTestBtn.disabled = true;
    elements.createTestBtn.textContent = "Creating...";
  }
  
  try {
    console.log("Creating test document for group:", state.currentGroup.id);
    
    const newTestRef = await addDoc(collection(db, 'tests'), {
      title: 'Untitled Test',
      status: 'draft',
      groupId: state.currentGroup.id,
      ownerId: state.currentUser.uid,
      createdAt: serverTimestamp(),
      questionCount: 0,
      description: ''
    });
    
    console.log("Test created with ID:", newTestRef.id);
    
    // Store IDs and redirect
    localStorage.setItem('current_edit_test_id', newTestRef.id);
    localStorage.setItem('current_edit_group_id', state.currentGroup.id);
    
    setTimeout(() => {
      redirect(`create-test.html?groupId=${state.currentGroup.id}&testId=${newTestRef.id}`);
    }, 100);
    
  } catch (error) {
    console.error("Failed to create test:", error);
    alert("Error creating test. Please try again.");
    
    if (elements.createTestBtn) {
      elements.createTestBtn.disabled = false;
      elements.createTestBtn.textContent = "+ Create New Test";
    }
  }
}

function handleTestActions(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  
  const action = button.dataset.action;
  const card = button.closest('.test-card');
  if (!card) return;
  
  const testId = card.dataset.testId;
  if (!testId) {
    console.error("Test card has no test ID");
    return;
  }
  
  switch (action) {
    case 'take':
      redirect(`take-test.html?testId=${testId}`);
      break;
      
    case 'edit':
      localStorage.setItem('current_edit_test_id', testId);
      localStorage.setItem('current_edit_group_id', state.groupId);
      redirect(`create-test.html?groupId=${state.groupId}&testId=${testId}`);
      break;
      
    case 'delete':
      if (confirm('Are you sure you want to delete this test? This cannot be undone.')) {
        deleteTest(testId, card);
      }
      break;
  }
}

async function deleteTest(testId, cardElement) {
  try {
    await deleteDoc(doc(db, 'tests', testId));
    
    if (cardElement) {
      cardElement.remove();
    }
    
    if (elements.testsList && elements.testsList.children.length === 0) {
      if (elements.noTestsMessage) {
        elements.noTestsMessage.style.display = 'block';
      }
    }
    
    alert('Test deleted successfully.');
    
  } catch (error) {
    console.error("Error deleting test:", error);
    alert('Failed to delete test. Please try again.');
  }
}

function setupEventListeners() {
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => signOut(auth));
  }
  
  if (elements.createTestBtn) {
    elements.createTestBtn.addEventListener('click', handleCreateTest);
  }
  
  if (elements.testsList) {
    elements.testsList.addEventListener('click', handleTestActions);
  }
}

document.addEventListener('DOMContentLoaded', init);