import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
    deleteDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentUser = null;

// DOM refs (set in init)
let userDisplayName;
let welcomeUserName;
let logoutBtn;
let joinGroupForm;
let createGroupBtn;
let groupsGrid;
let noGroupsMessage;
let groupCodeInput;
let takeTestForm;
let testCodeInput;

function redirectToLanding() {
    window.location.href = 'index.html';
}

async function fetchUserProfile(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) return snap.data();
    } catch (err) {
        console.error('Error fetching user profile:', err);
    }
    return null;
}

async function loadUserGroups() {
    if (!currentUser || !groupsGrid || !noGroupsMessage) return;
    groupsGrid.innerHTML = '';
    noGroupsMessage.style.display = 'block';

    try {
        const membershipQ = query(collection(db, 'memberships'), where('userId', '==', currentUser.uid));
        const membershipSnap = await getDocs(membershipQ);
        if (membershipSnap.empty) {
            noGroupsMessage.style.display = 'block';
            return;
        }

        // collect unique groupIds
        const groupIdSet = new Set();
        membershipSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.groupId) groupIdSet.add(data.groupId);
        });

        if (groupIdSet.size === 0) {
            noGroupsMessage.style.display = 'block';
            return;
        }

const groups = [];
for (const id of Array.from(groupIdSet)) {
    try {
        const gSnap = await getDoc(doc(db, 'groups', id));
        if (gSnap.exists()) groups.push({ id: gSnap.id, ...gSnap.data() });
    } catch (err) {
        console.warn('Failed to fetch group', id, err);
    }
}

if (groups.length === 0) {
    noGroupsMessage.style.display = 'block';
    return;
}

// compute accurate member counts for each group
try {
    const countPromises = groups.map(g =>
        getDocs(query(collection(db, 'memberships'), where('groupId', '==', g.id)))
            .then(snap => snap.size)
            .catch(err => {
                console.warn('Failed to count members for', g.id, err);
                return (typeof g.membersCount === 'number') ? g.membersCount : 0;
            })
    );
    const counts = await Promise.all(countPromises);
    groups.forEach((g, i) => {
        g.membersCount = typeof counts[i] === 'number' ? counts[i] : (g.membersCount || 0);
    });
} catch (err) {
    console.warn('Failed to compute member counts:', err);
    // fallback to stored membersCount if available
    groups.forEach(g => { g.membersCount = g.membersCount || 0; });
}

// render and attach a single guarded click handler
noGroupsMessage.style.display = 'none';



groupsGrid.innerHTML = groups.map(g => renderGroupCard(g)).join('');

groupsGrid.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', (e) => {
        const groupId = card.dataset.groupId;
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }
        window.location.href = `groups.html?id=${encodeURIComponent(groupId)}`;
    });
});

// manage (delete) button handlers
groupsGrid.querySelectorAll('.group-manage-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = btn.closest('.group-card')?.dataset.groupId;
        if (!groupId) return;
        // Confirm and delete (handler checks ownership)
        handleDeleteGroup(groupId);
    });
});
// ...existing code...
    } catch (err) {
        console.error('Error loading groups:', err);
        noGroupsMessage.style.display = 'block';
    }
}


function renderGroupCard(group) {
    const tests = typeof group.testsCount === 'number' ? group.testsCount : (group.testsCount ? Number(group.testsCount) : 0);
    return `
      <div class="group-card" data-group-id="${escapeHtml(group.id)}">
        <div class="group-header" style="display:flex; justify-content:space-between;">
          <div class="group-icon ${group.gradient || 'primary-gradient'}">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>



                    <button type="button" class="group-manage-btn" title="Delete group" aria-label="Delete group" 
                    style="background: var(--bg-color);
    color: var(--text-muted);
    box-shadow: var(--shadow-neumorphic-small);
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    border: none;
    cursor: pointer;
    font-weight: 600;
    transition: var(--transition-smooth);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>

          <!-- Tests count -->
                    <div class="group-stats">
            <div class="group-tests" style = "display:flex;">
              <div class="group-tests-label">Tests : </div>
              <div class="group-tests-value">${tests}</div>
            </div>
          </div>

          

        <div class="group-info">
          <h3>${escapeHtml(group.name || 'Untitled Group')}</h3>
          <div class="group-meta"><span>${group.membersCount || 0} members</span></div>
          <div class="group-code-wrap">
            <span class="code-label">Code:</span>
            <span class="group-code">${escapeHtml(group.code || '')}</span>
          </div>
        </div>
        <div class="group-footer">
          <div class="group-next-exam">Next: ${escapeHtml(group.nextExam || 'TBD')}</div>
        </div>
      </div>
    `;
}


function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function handleJoinGroup(e) {
    e.preventDefault();
    if (!groupCodeInput || !currentUser) return;
    const code = groupCodeInput.value.trim();
    if (!code) return alert('Enter a group code.');

    try {
        // find group by code
        const q = query(collection(db, 'groups'), where('code', '==', code));
        const snap = await getDocs(q);
        if (snap.empty) return alert('Group not found.');

        const g = snap.docs[0];
        const groupId = g.id;

        // check existing membership for this user and group
        const memQ = query(collection(db, 'memberships'),
                           where('userId', '==', currentUser.uid),
                           where('groupId', '==', groupId));
        const memSnap = await getDocs(memQ);
        if (!memSnap.empty) {
            groupCodeInput.value = '';
            return alert('You are already a member of this group.');
        }

        await addDoc(collection(db, 'memberships'), {
            userId: currentUser.uid,
            groupId,
            joinedAt: serverTimestamp()
        });

        groupCodeInput.value = '';
        await loadUserGroups();
        alert('Joined group successfully.');
    } catch (err) {
        console.error('Error joining group:', err);
        alert('Failed to join group. Try again.');
    }
}



async function handleCreateGroup() {
    const name = prompt('Enter a name for the new group:');
    if (!name || !name.trim()) return;
    if (!currentUser) return alert('Not authenticated.');

    try {
        const code = generateGroupCode();
        const grpRef = await addDoc(collection(db, 'groups'), {
            name: name.trim(),
            ownerId: currentUser.uid,
            code,
            membersCount: 1,
            createdAt: serverTimestamp()
        });

        // ensure no duplicate membership: check first
        const memQ = query(collection(db, 'memberships'),
                           where('userId', '==', currentUser.uid),
                           where('groupId', '==', grpRef.id));
        const memSnap = await getDocs(memQ);
        if (memSnap.empty) {
            await addDoc(collection(db, 'memberships'), {
                userId: currentUser.uid,
                groupId: grpRef.id,
                joinedAt: serverTimestamp()
            });
        }

        await loadUserGroups();
        alert(`Group created. Code: ${code}`);
    } catch (err) {
        console.error('Error creating group:', err);
        alert('Failed to create group.');
    }
}

// ...existing code...
async function handleDeleteGroup(groupId) {
    if (!currentUser) {
        alert('Not authenticated.');
        return;
    }

    // fetch group to check owner
    try {
        const gRef = doc(db, 'groups', groupId);
        const gSnap = await getDoc(gRef);
        if (!gSnap.exists()) {
            alert('Group not found.');
            return;
        }
        const group = gSnap.data();
        const ownerId = group.ownerId || group.owner || null;
        if (ownerId !== currentUser.uid) {
            return alert('Only the group owner can delete this group.');
        }

        if (!confirm('Are you sure you want to delete this group? This will remove all memberships and cannot be undone.')) {
            return;
        }

        // delete all membership docs for this group using a batch
        const memQ = query(collection(db, 'memberships'), where('groupId', '==', groupId));
        const memSnap = await getDocs(memQ);

        const batch = writeBatch(db);
        memSnap.forEach(ms => {
            batch.delete(ms.ref);
        });
        batch.delete(gRef);
        await batch.commit();

        // remove card from UI
        const card = document.querySelector(`.group-card[data-group-id="${groupId}"]`);
        if (card) card.remove();

        // if no more cards, show noGroupsMessage
        if (groupsGrid && groupsGrid.querySelectorAll('.group-card').length === 0 && noGroupsMessage) {
            noGroupsMessage.style.display = 'block';
        }

        alert('Group deleted.');
    } catch (err) {
        console.error('Failed to delete group:', err);
        alert('Failed to delete group. Check console for details.');
    }
}
// ...existing code...

function generateGroupCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function handleLogout() {
    try {
        await signOut(auth);
        redirectToLanding();
    } catch (err) {
        console.error('Logout failed:', err);
        alert('Logout failed. Try again.');
    }
}

function handleTakeTest(e) {
    e.preventDefault();
    if (!testCodeInput) return;
    const id = testCodeInput.value.trim();
    if (!id) return;
    window.location.href = `take-test.html?id=${encodeURIComponent(id)}`;
}

function init() {
    userDisplayName = document.getElementById('user-display-name');
    welcomeUserName = document.getElementById('welcome-user-name');
    logoutBtn = document.getElementById('logout-btn');
    joinGroupForm = document.getElementById('join-group-form');
    groupCodeInput = document.getElementById('group-code-input');
    takeTestForm = document.getElementById('take-test-form');
    testCodeInput = document.getElementById('test-code-input');
    createGroupBtn = document.getElementById('create-group-btn');
    groupsGrid = document.getElementById('groups-grid');
    noGroupsMessage = document.getElementById('no-groups-message');

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            redirectToLanding();
            return;
        }
        currentUser = user;
        if (user.displayName && userDisplayName) {
            userDisplayName.textContent = user.displayName;
        } else {
            const profile = await fetchUserProfile(user.uid);
            const name = (profile && (profile.firstName || profile.fullName)) || user.email || 'User';
            if (userDisplayName) userDisplayName.textContent = name;
        }
        if (welcomeUserName) {
            const short = (user.displayName || (user.email ? user.email.split('@')[0] : 'User'));
            welcomeUserName.textContent = short;
        }

        await loadUserGroups();
    });

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (joinGroupForm) joinGroupForm.addEventListener('submit', handleJoinGroup);
    if (createGroupBtn) createGroupBtn.addEventListener('click', handleCreateGroup);
    if (takeTestForm) takeTestForm.addEventListener('submit', handleTakeTest);

    if (!noGroupsMessage && groupsGrid) {
        const el = document.createElement('div');
        el.id = 'no-groups-message';
        el.className = 'no-groups-message';
        el.textContent = 'You are not part of any groups yet.';
        groupsGrid.parentNode.insertBefore(el, groupsGrid);
        noGroupsMessage = el;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}














// javascript
// filepath: assets/js/dashboard.js
// ...existing code...



// ...existing code...


// ...existing code...

// ...existing code...