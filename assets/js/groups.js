// --- FIREBASE IMPORTS ---
// ...existing code...
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

function qs(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function escapeHtml(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function redirectToDashboard() {
  window.location.href = 'dashboard.html';
}

function redirectToLanding() {
  window.location.href = 'index.html';
}

async function loadGroupAndMembers(groupId) {
  const groupTitleEl = document.getElementById('group-title');
  const groupCodeEl = document.getElementById('group-code');
  const groupCopyBtn = document.getElementById('group-copy-btn');
  const membersList = document.getElementById('members-list');
  const noMembersMessage = document.getElementById('no-members-message');

  if (groupTitleEl) groupTitleEl.textContent = 'Loading...';
  if (noMembersMessage) noMembersMessage.textContent = 'Loading members...';

  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) {
      alert('Group not found.');
      redirectToDashboard();
      return;
    }
    const group = { id: groupSnap.id, ...groupSnap.data() };

    if (groupTitleEl) groupTitleEl.textContent = group.name || 'Untitled Group';
    if (groupCodeEl) groupCodeEl.textContent = group.code || '';
    if (groupCopyBtn) groupCopyBtn.dataset.code = group.code || '';

    // Load members via memberships collection (expects documents with userId & groupId)
    membersList.innerHTML = '';
    const membershipsQ = query(collection(db, 'memberships'), where('groupId', '==', groupId));
    const membershipSnap = await getDocs(membershipsQ);
    if (membershipSnap.empty) {
      if (noMembersMessage) noMembersMessage.textContent = "No members yet.";
      return;
    }

    const memberPromises = [];
    membershipSnap.forEach(ms => {
      const data = ms.data();
      if (data && data.userId) memberPromises.push(getDoc(doc(db, 'users', data.userId)));
    });

    const memberDocs = await Promise.all(memberPromises);
    let anyMember = false;
    memberDocs.forEach(mSnap => {
      if (mSnap && mSnap.exists()) {
        anyMember = true;
        const u = mSnap.data();
        const li = document.createElement('li');
        li.className = 'item';
        li.innerHTML = `
          <div class="member-item">
            <div class="member-name">${escapeHtml(u.firstName ? `${u.firstName} ${u.lastName || ''}` : (u.displayName || u.email || 'User'))}</div>
            <div class="member-meta">${escapeHtml(u.email || '')}</div>
          </div>
        `;
        membersList.appendChild(li);
      }
    });

    if (!anyMember && noMembersMessage) noMembersMessage.textContent = "No members yet.";
    else if (noMembersMessage) noMembersMessage.style.display = 'none';
  } catch (err) {
    console.error('Failed to load group or members', err);
    alert('Failed to load group. Check console for details.');
    redirectToDashboard();
  }
}

function setupCopyButton() {
  const btn = document.getElementById('group-copy-btn');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const code = btn.dataset.code || document.getElementById('group-code')?.textContent?.trim();
    if (!code) return;
    const original = btn.innerHTML;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      btn.setAttribute('title', 'Copied!');
    } catch (err) {
      console.error('Copy failed', err);
      btn.setAttribute('title', 'Copy failed');
    }
    setTimeout(() => {
      btn.innerHTML = original;
      btn.setAttribute('title', 'Copy code');
    }, 1400);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const groupId = qs('id');
  if (!groupId) {
    alert('Missing group id.');
    redirectToDashboard();
    return;
  }

  // Guard with auth
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      redirectToLanding();
      return;
    }
    loadGroupAndMembers(groupId);
    setupCopyButton();
  });
});
// --- DOM ELEMENT SELECTION ---
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');
const groupNameEl = document.getElementById('group-name');
const groupCodeEl = document.getElementById('group-code');
const createTestBtn = document.getElementById('create-test-btn');
const ownerActionsEl = document.getElementById('owner-actions');
const testsListEl = document.getElementById('tests-list');
const membersListEl = document.getElementById('members-list');
const noTestsMessage = document.getElementById('no-tests-message');
const noMembersMessage = document.getElementById('no-members-message');

let currentUser;

// --- INITIALIZATION ---
// This main function runs as soon as the page loads.
const init = () => {
    // 1. Get the Group ID from the URL (e.g., group.html?id=ABCDEFG)
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('id');

    // 2. If no ID is found, the user cannot be on this page. Redirect them.
    if (!groupId) {
        alert('No group specified. Redirecting to your dashboard.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 3. AUTH GUARD: Check if a user is logged in.
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        if(userDisplayName) userDisplayName.textContent = user.displayName || user.email;
        
        // 4. Once we have the user and groupId, load all the necessary page data.
        loadGroupData(groupId);
      } else {
        // If not logged in, they are sent back to the landing page.
        window.location.href = 'index.html';
      }
    });
};

// --- DATA FETCHING AND RENDERING ---

// Main function to load all data related to the specific group.
const loadGroupData = async (groupId) => {
    try {
        const groupRef = doc(db, "groups", groupId);
        const groupDoc = await getDoc(groupRef);

        if (!groupDoc.exists()) {
            alert('Group not found. It may have been deleted.');
            window.location.href = 'dashboard.html';
            return;
        }

        const groupData = groupDoc.data();
        
        // Display the group's info in the page header
        groupNameEl.textContent = groupData.groupName;
        groupCodeEl.textContent = groupData.groupCode;

        // Security Check: Show the "Create Test" button ONLY if the current user is the owner.
        if (currentUser.uid === groupData.ownerId) {
            ownerActionsEl.style.display = 'block';
        }

        // Load the tests and members for this group.
        loadTests(groupId);
        loadMembers(groupId);

    } catch (error) {
        console.error("Error loading group data:", error);
        alert("Could not load group data. Please try again.");
    }
};

// Function to load all tests that have been assigned to this group.
const loadTests = async (groupId) => {
    testsListEl.innerHTML = ''; // Clear default message
    noTestsMessage.style.display = 'block'; // Show by default
    
    // Placeholder for now. This is where you will query the 'tests' collection.
    // e.g., const q = query(collection(db, "tests"), where("groupId", "==", groupId));
    // For now, we'll just show the "no tests have been created" message.
};

// Function to load and display all members of this group.
const loadMembers = async (groupId) => {
    membersListEl.innerHTML = ''; // Clear current list
    noMembersMessage.style.display = 'none'; // Hide default message

    try {
        // 1. Find all 'membership' documents for this group to get member IDs.
        const membershipQuery = query(collection(db, "memberships"), where("groupId", "==", groupId));
        const membershipSnapshot = await getDocs(membershipQuery);
        const memberUserIds = membershipSnapshot.docs.map(d => d.data().userId);

        // 2. The group owner is also a member, so get their ID too.
        const groupDoc = await getDoc(doc(db, "groups", groupId));
        const ownerId = groupDoc.data().ownerId;
        if (!memberUserIds.includes(ownerId)) {
            memberUserIds.push(ownerId);
        }
        
        if(memberUserIds.length === 0) {
            noMembersMessage.style.display = 'block';
            return;
        }
        
        // 3. For each unique member ID, fetch their user profile and display their name.
        for(const userId of memberUserIds) {
            const userDoc = await getDoc(doc(db, "users", userId));
            if(userDoc.exists()) {
                const li = document.createElement('li');
                li.className = 'member-item';
                li.textContent = userDoc.data().fullName || userDoc.data().email;
                membersListEl.appendChild(li);
            }
        }
    } catch (error) {
        console.error("Error loading members:", error);
        noMembersMessage.textContent = "Error loading members.";
        noMembersMessage.style.display = 'block';
    }
};


// --- EVENT LISTENERS ---

// Logout Button
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).catch((error) => console.error('Sign out error:', error));
    });
}

// "Create New Test" Button
if (createTestBtn) {
    createTestBtn.addEventListener('click', async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const groupId = urlParams.get('id');

        try {
            // Instantly create a new 'draft' test in Firestore
            const newTestRef = await addDoc(collection(db, "tests"), {
                title: "Untitled Test",
                groupId: groupId,
                ownerId: currentUser.uid,
                status: "draft",
                createdAt: serverTimestamp()
            });

            // Redirect to the new editor page with the new test's ID
            window.location.href = `create-test.html?testId=${newTestRef.id}&groupId=${groupId}`;

        } catch (error) {
            console.error("Error creating new test draft:", error);
            alert("Could not create a new test. Please try again.");
        }
    });
}

// --- RUN THE SCRIPT ---
// This starts the entire process when the page is loaded.
init();

