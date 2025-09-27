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
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- APPLICATION STATE ---
const state = {
  groupId: null,
  currentUser: null,
  currentGroup: null,
  isOwner: false,
  isLoading: true,
  members: new Map(),
  pendingRequests: new Map(),
  activeKebabMenu: null
};

// --- DOM ELEMENTS ---
const elements = {
  userDisplay: document.getElementById('user-display-name'),
  logoutBtn: document.getElementById('logout-btn'),
  groupName: document.getElementById('group-name'),
  groupCode: document.getElementById('group-code'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  ownerActions: document.getElementById('owner-actions'),
  createTestBtn: document.getElementById('create-test-btn'),
  testsList: document.getElementById('tests-list'),
  noTestsMessage: document.getElementById('no-tests-message'),
  membersList: document.getElementById('members-list'),
  noMembersMessage: document.getElementById('no-members-message'),
  membersCard: document.getElementById('members-card'),
  groupInfoCard: document.getElementById('group-info-card'),
  ownerControlsCard: document.getElementById('owner-controls-card'),
  showMembersToggle: document.getElementById('show-members-toggle'),
  memberCount: document.getElementById('member-count'),
  infoMessage: document.getElementById('info-message'),
  manageMembersBtn: document.getElementById('manage-members-btn'),
  memberModalOverlay: document.getElementById('member-modal-overlay'),
  memberModalClose: document.getElementById('member-modal-close'),
  pendingRequestsList: document.getElementById('pending-requests-list'),
  currentMembersList: document.getElementById('current-members-list'),
  noRequestsMessage: document.getElementById('no-requests-message'),
  noMembersModalMessage: document.getElementById('no-members-modal-message'),
  requestCount: document.getElementById('request-count'),
  memberCountModal: document.getElementById('member-count-modal')
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

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
}

// Copy to clipboard function
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  }
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
    
    // Load members first, then update UI
    await loadMembers();
    updateGroupUI();
    await loadTests();
    
    state.isLoading = false;
    
  } catch (error) {
    console.error("Error in loadGroupData:", error);
    throw error;
  }
}

function updateGroupUI() {
  if (!state.currentGroup) return;
  
  console.log("Updating UI - isOwner:", state.isOwner, "showMembersToAll:", state.currentGroup.showMembersToAll);
  
  if (elements.groupName) {
    elements.groupName.textContent = escapeHtml(state.currentGroup.name);
  }
  
  if (elements.groupCode) {
    elements.groupCode.textContent = escapeHtml(state.currentGroup.code || '');
  }
  
  if (elements.ownerActions) {
    elements.ownerActions.style.display = state.isOwner ? 'block' : 'none';
  }
  
  // Show manage members button only for owner
  if (elements.manageMembersBtn) {
    elements.manageMembersBtn.style.display = state.isOwner ? 'inline-flex' : 'none';
  }
  
  // Update member count
  if (elements.memberCount && state.members.size > 0) {
    elements.memberCount.textContent = `(${state.members.size})`;
  }
  
  // Show owner controls only to owner
  if (elements.ownerControlsCard) {
    elements.ownerControlsCard.style.display = state.isOwner ? 'block' : 'none';
  }
  
  // Set toggle state
  if (elements.showMembersToggle && state.isOwner) {
    elements.showMembersToggle.checked = state.currentGroup.showMembersToAll || false;
  }
  
  // Control member list visibility
  const shouldShowMembers = state.isOwner || state.currentGroup.showMembersToAll;
  
  if (elements.membersCard) {
    elements.membersCard.style.display = shouldShowMembers ? 'block' : 'none';
  }
  
  // Show info card for non-owners based on settings
  if (elements.groupInfoCard) {
    if (state.isOwner) {
      elements.groupInfoCard.style.display = 'none';
    } else {
      elements.groupInfoCard.style.display = shouldShowMembers ? 'none' : 'block';
      if (elements.infoMessage) {
        if (state.currentGroup.showMembersToAll === false) {
          elements.infoMessage.textContent = 'You are a member of this group. The group owner has chosen to keep the member list private.';
        } else {
          elements.infoMessage.textContent = 'You are a member of this group.';
        }
      }
    }
  }
}

// --- MEMBER MANAGEMENT FUNCTIONS ---
async function loadMembers() {
  try {
    console.log("Loading members for group:", state.groupId);
    
    const ownerId = state.currentGroup.ownerId;
    if (!ownerId) {
      throw new Error("Group has no owner ID");
    }
    
    // Clear previous members
    state.members.clear();
    
    // Get owner info first
    const ownerDoc = await getDoc(doc(db, 'users', ownerId));
    if (ownerDoc.exists()) {
      state.members.set(ownerId, {
        id: ownerId,
        ...ownerDoc.data(),
        isOwner: true,
        role: 'owner'
      });
    }
    
    // Get members from memberships collection
    const membershipsQuery = query(
      collection(db, 'memberships'), 
      where('groupId', '==', state.groupId)
    );
    
    const querySnapshot = await getDocs(membershipsQuery);
    
    const memberPromises = querySnapshot.docs.map(async (docSnap) => {
      const membershipData = docSnap.data();
      if (membershipData.userId !== ownerId) { // Skip owner as already added
        const userDoc = await getDoc(doc(db, 'users', membershipData.userId));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          state.members.set(membershipData.userId, {
            id: membershipData.userId,
            ...userData,
            isOwner: false,
            role: membershipData.role || 'member'
          });
        }
      }
    });
    
    await Promise.all(memberPromises);
    
    console.log("Loaded members:", state.members.size);
    renderMembersList();
    
  } catch (error) {
    console.error("Error loading members:", error);
    if (elements.noMembersMessage) {
      elements.noMembersMessage.textContent = "Failed to load members. Please refresh the page.";
      elements.noMembersMessage.style.display = 'block';
    }
  }
}

function renderMembersList() {
  if (!elements.membersList) return;
  
  console.log("Rendering members list with", state.members.size, "members");
  
  elements.membersList.innerHTML = '';
  
  if (state.members.size === 0) {
    if (elements.noMembersMessage) {
      elements.noMembersMessage.style.display = 'block';
      elements.noMembersMessage.textContent = 'No members found.';
    }
    return;
  }
  
  if (elements.noMembersMessage) {
    elements.noMembersMessage.style.display = 'none';
  }
  
  // Convert to array and sort (owner first)
  const membersArray = Array.from(state.members.values());
  membersArray.sort((a, b) => {
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return (a.fullName || a.displayName || a.email || '').localeCompare(
      b.fullName || b.displayName || b.email || ''
    );
  });
  
  membersArray.forEach(member => {
    const li = document.createElement('li');
    li.className = 'member-item';
    
    const displayName = member.fullName || member.displayName || member.email || 'User';
    
    li.innerHTML = `
      <div class="member-info">
        <span class="member-name">${escapeHtml(displayName)}</span>
        ${member.isOwner ? '<span class="owner-badge">Owner</span>' : ''}
      </div>
    `;
    
    elements.membersList.appendChild(li);
  });
  
  console.log("Members list rendered successfully");
}

async function handleMemberVisibilityToggle() {
  if (!state.isOwner || !state.currentGroup) return;
  
  try {
    const newValue = elements.showMembersToggle.checked;
    console.log("Updating member visibility to:", newValue);
    
    const groupRef = doc(db, 'groups', state.groupId);
    await updateDoc(groupRef, {
      showMembersToAll: newValue,
      updatedAt: serverTimestamp()
    });
    
    state.currentGroup.showMembersToAll = newValue;
    updateGroupUI();
    
  } catch (error) {
    console.error("Error updating member visibility:", error);
    alert("Failed to update settings. Please try again.");
    
    // Revert toggle
    if (elements.showMembersToggle) {
      elements.showMembersToggle.checked = state.currentGroup.showMembersToAll || false;
    }
  }
}

// --- MODAL FUNCTIONS ---
function openMemberModal() {
  if (elements.memberModalOverlay) {
    elements.memberModalOverlay.style.display = 'flex';
    loadPendingRequests();
    renderCurrentMembersModal();
  }
}

function closeMemberModal() {
  if (elements.memberModalOverlay) {
    elements.memberModalOverlay.style.display = 'none';
  }
  closeKebabMenu();
}

function closeKebabMenu() {
  if (state.activeKebabMenu) {
    state.activeKebabMenu.classList.remove('active');
    state.activeKebabMenu = null;
  }
}

// --- PENDING REQUESTS FUNCTIONS ---
async function loadPendingRequests() {
  try {
    console.log("Loading pending requests for group:", state.groupId);
    
    const requestsQuery = query(
      collection(db, 'memberRequests'),
      where('groupId', '==', state.groupId),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(requestsQuery);
    
    state.pendingRequests.clear();
    
    const requestPromises = querySnapshot.docs.map(async (docSnap) => {
      const requestData = docSnap.data();
      const userDoc = await getDoc(doc(db, 'users', requestData.userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        state.pendingRequests.set(docSnap.id, {
          id: docSnap.id,
          ...requestData,
          user: userData
        });
      }
    });
    
    await Promise.all(requestPromises);
    
    renderPendingRequests();
    
  } catch (error) {
    console.error("Error loading pending requests:", error);
  }
}

function renderPendingRequests() {
  if (!elements.pendingRequestsList || !elements.requestCount || !elements.noRequestsMessage) return;
  
  const requestsArray = Array.from(state.pendingRequests.values());
  
  if (elements.requestCount) {
    elements.requestCount.textContent = requestsArray.length;
  }
  
  if (requestsArray.length === 0) {
    elements.pendingRequestsList.innerHTML = '';
    elements.noRequestsMessage.style.display = 'block';
    return;
  }
  
  elements.noRequestsMessage.style.display = 'none';
  elements.pendingRequestsList.innerHTML = '';
  
  requestsArray.forEach(request => {
    const requestItem = document.createElement('div');
    requestItem.className = 'member-request-item';
    
    const displayName = request.user.fullName || request.user.displayName || request.user.email || 'Unknown User';
    const initials = getInitials(displayName);
    
    requestItem.innerHTML = `
      <div class="member-info-modal">
        <div class="member-avatar">${initials}</div>
        <div class="member-details">
          <div class="member-name-modal">${escapeHtml(displayName)}</div>
          <div class="member-email">${escapeHtml(request.user.email || '')}</div>
        </div>
      </div>
      <div class="member-actions">
        <button class="btn-accept" data-request-id="${request.id}" data-action="accept">Accept</button>
        <button class="btn-decline" data-request-id="${request.id}" data-action="decline">Decline</button>
      </div>
    `;
    
    elements.pendingRequestsList.appendChild(requestItem);
  });
}

function renderCurrentMembersModal() {
  if (!elements.currentMembersList || !elements.memberCountModal) return;
  
  const membersArray = Array.from(state.members.values());
  
  if (elements.memberCountModal) {
    elements.memberCountModal.textContent = membersArray.length;
  }
  
  if (membersArray.length === 0) {
    if (elements.noMembersModalMessage) {
      elements.noMembersModalMessage.style.display = 'block';
    }
    elements.currentMembersList.innerHTML = '';
    return;
  }
  
  if (elements.noMembersModalMessage) {
    elements.noMembersModalMessage.style.display = 'none';
  }
  
  elements.currentMembersList.innerHTML = '';
  
  // Sort members (owner first)
  membersArray.sort((a, b) => {
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return (a.fullName || a.displayName || a.email || '').localeCompare(
      b.fullName || b.displayName || b.email || ''
    );
  });
  
  membersArray.forEach(member => {
    const memberItem = document.createElement('div');
    memberItem.className = 'member-item-modal';
    
    const displayName = member.fullName || member.displayName || member.email || 'User';
    const initials = getInitials(displayName);
    const isCurrentUser = member.id === state.currentUser.uid;
    
    let roleText = 'Member';
    let roleClass = 'member';
    if (member.isOwner) {
      roleText = 'Owner';
      roleClass = 'owner';
    } else if (member.role === 'editor') {
      roleText = 'Editor';
      roleClass = 'editor';
    }
    
    const kebabMenu = member.isOwner || isCurrentUser ? '' : `
      <div class="kebab-menu" data-member-id="${member.id}">
        <button class="kebab-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="12" cy="5" r="1"></circle>
            <circle cx="12" cy="19" r="1"></circle>
          </svg>
        </button>
        <div class="kebab-menu-dropdown">
          <button class="kebab-menu-item" data-action="toggle-editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            ${member.role === 'editor' ? 'Remove Editor Access' : 'Grant Editor Access'}
          </button>
          <button class="kebab-menu-item danger" data-action="remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
            Remove Member
          </button>
        </div>
      </div>
    `;
    
    memberItem.innerHTML = `
      <div class="member-info-modal">
        <div class="member-avatar">${initials}</div>
        <div class="member-details">
          <div class="member-name-modal">${escapeHtml(displayName)}</div>
          <div class="member-email">${escapeHtml(member.email || '')}</div>
          <span class="member-role ${roleClass}">${roleText}</span>
        </div>
      </div>
      <div class="member-actions">
        ${kebabMenu}
      </div>
    `;
    
    elements.currentMembersList.appendChild(memberItem);
  });
}

// --- MEMBER ACTION HANDLERS ---
async function handleMemberRequest(requestId, action) {
  try {
    const request = state.pendingRequests.get(requestId);
    if (!request) return;
    
    if (action === 'accept') {
      // Add to memberships collection
      await addDoc(collection(db, 'memberships'), {
        groupId: state.groupId,
        userId: request.userId,
        role: 'member',
        joinedAt: serverTimestamp()
      });
      
      // Update request status
      await updateDoc(doc(db, 'memberRequests', requestId), {
        status: 'accepted',
        processedAt: serverTimestamp(),
        processedBy: state.currentUser.uid
      });
      
      // Reload data
      await loadMembers();
      await loadPendingRequests();
      
    } else if (action === 'decline') {
      // Update request status
      await updateDoc(doc(db, 'memberRequests', requestId), {
        status: 'declined',
        processedAt: serverTimestamp(),
        processedBy: state.currentUser.uid
      });
      
      await loadPendingRequests();
    }
    
  } catch (error) {
    console.error("Error handling member request:", error);
    alert("Failed to process member request. Please try again.");
  }
}

async function handleMemberAction(memberId, action) {
  try {
    const member = state.members.get(memberId);
    if (!member || member.isOwner) return;
    
    if (action === 'toggle-editor') {
      const newRole = member.role === 'editor' ? 'member' : 'editor';
      
      // Find and update membership document
      const membershipQuery = query(
        collection(db, 'memberships'),
        where('groupId', '==', state.groupId),
        where('userId', '==', memberId)
      );
      
      const querySnapshot = await getDocs(membershipQuery);
      if (!querySnapshot.empty) {
        const membershipDoc = querySnapshot.docs[0];
        await updateDoc(membershipDoc.ref, {
          role: newRole,
          updatedAt: serverTimestamp()
        });
        
        // Reload members
        await loadMembers();
        renderCurrentMembersModal();
      }
      
    } else if (action === 'remove') {
      if (confirm(`Are you sure you want to remove ${member.fullName || member.displayName || member.email} from the group?`)) {
        // Find and delete membership document
        const membershipQuery = query(
          collection(db, 'memberships'),
          where('groupId', '==', state.groupId),
          where('userId', '==', memberId)
        );
        
        const querySnapshot = await getDocs(membershipQuery);
        if (!querySnapshot.empty) {
          const membershipDoc = querySnapshot.docs[0];
          await deleteDoc(membershipDoc.ref);
          
          // Reload members
          await loadMembers();
          renderCurrentMembersModal();
        }
      }
    }
    
    closeKebabMenu();
    
  } catch (error) {
    console.error("Error handling member action:", error);
    alert("Failed to perform action. Please try again.");
  }
}

// --- TEST MANAGEMENT FUNCTIONS ---
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

async function handleCopyCode() {
  if (!state.currentGroup || !state.currentGroup.code) {
    alert('No group code available to copy.');
    return;
  }
  
  const success = await copyToClipboard(state.currentGroup.code);
  
  if (success) {
    const originalHtml = elements.copyCodeBtn.innerHTML;
    elements.copyCodeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20,6 9,17 4,12"></polyline>
      </svg>
    `;
    elements.copyCodeBtn.style.color = 'var(--success-color, #4ade80)';
    
    const tempMessage = document.createElement('div');
    tempMessage.textContent = 'Copied!';
    tempMessage.style.cssText = `
      position: absolute;
      background: var(--success-color, #4ade80);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
    `;
    
    elements.copyCodeBtn.style.position = 'relative';
    elements.copyCodeBtn.appendChild(tempMessage);
    
    setTimeout(() => {
      elements.copyCodeBtn.innerHTML = originalHtml;
      elements.copyCodeBtn.style.color = '';
      if (tempMessage.parentNode) {
        tempMessage.parentNode.removeChild(tempMessage);
      }
    }, 2000);
  } else {
    alert('Failed to copy group code. Please copy it manually: ' + state.currentGroup.code);
  }
}

// --- EVENT LISTENERS ---
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
  
  if (elements.copyCodeBtn) {
    elements.copyCodeBtn.addEventListener('click', handleCopyCode);
  }
  
  if (elements.showMembersToggle) {
    elements.showMembersToggle.addEventListener('change', handleMemberVisibilityToggle);
  }
  
  // Member modal events
  if (elements.manageMembersBtn) {
    elements.manageMembersBtn.addEventListener('click', openMemberModal);
  }
  
  if (elements.memberModalClose) {
    elements.memberModalClose.addEventListener('click', closeMemberModal);
  }
  
  if (elements.memberModalOverlay) {
    elements.memberModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.memberModalOverlay) {
        closeMemberModal();
      }
    });
  }
  
  // Handle member request actions
  if (elements.pendingRequestsList) {
    elements.pendingRequestsList.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (button) {
        const requestId = button.dataset.requestId;
        const action = button.dataset.action;
        handleMemberRequest(requestId, action);
      }
    });
  }
  
  // Handle kebab menu and member actions
  if (elements.currentMembersList) {
    elements.currentMembersList.addEventListener('click', (e) => {
      const kebabBtn = e.target.closest('.kebab-btn');
      const menuItem = e.target.closest('.kebab-menu-item');
      
      if (kebabBtn) {
        e.stopPropagation();
        const kebabMenu = kebabBtn.closest('.kebab-menu');
        
        // Close other menus
        if (state.activeKebabMenu && state.activeKebabMenu !== kebabMenu) {
          state.activeKebabMenu.classList.remove('active');
        }
        
        // Toggle current menu
        kebabMenu.classList.toggle('active');
        state.activeKebabMenu = kebabMenu.classList.contains('active') ? kebabMenu : null;
        
      } else if (menuItem) {
        const kebabMenu = menuItem.closest('.kebab-menu');
        const memberId = kebabMenu.dataset.memberId;
        const action = menuItem.dataset.action;
        
        handleMemberAction(memberId, action);
      }
    });
  }
  
  // Close kebab menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.kebab-menu')) {
      closeKebabMenu();
    }
  });
}

// --- INITIALIZE APP ---
document.addEventListener('DOMContentLoaded', init);