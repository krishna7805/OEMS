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
  return new URLSearchParams(window.location.search).get(name);
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

async function loadGroupAndMembers(groupId, currentUser) {
  const groupNameEl = document.getElementById('group-name');
  const groupCodeEl = document.getElementById('group-code');
  const createTestBtn = document.getElementById('create-test-btn');
  const ownerActions = document.getElementById('owner-actions');
  const membersListEl = document.getElementById('members-list');
  const noMembersMessage = document.getElementById('no-members-message');
  const noTestsMessage = document.getElementById('no-tests-message');

  if (groupNameEl) groupNameEl.textContent = 'Loading group...';
  if (groupCodeEl) groupCodeEl.textContent = '...';
  if (noMembersMessage) noMembersMessage.textContent = 'Loading members...';
  if (noTestsMessage) noTestsMessage.style.display = 'block';

  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) {
      alert('Group not found.');
      redirectToDashboard();
      return;
    }
    const gd = groupSnap.data();
    const groupName = gd.name || gd.groupName || 'Untitled Group';
    const groupCode = gd.code || gd.groupCode || '';
    const ownerId = gd.ownerId || gd.owner || null;

    if (groupNameEl) groupNameEl.textContent = escapeHtml(groupName);
    if (groupCodeEl) groupCodeEl.textContent = escapeHtml(groupCode);

    // Owner-only actions
    if (ownerActions) ownerActions.style.display = (currentUser && currentUser.uid === ownerId) ? 'block' : 'none';
    if (createTestBtn) {
      createTestBtn.onclick = () => {
        // simple nav to create-test page with groupId param
        window.location.href = `create-test.html?groupId=${encodeURIComponent(groupId)}`;
      };
    }

    // Load members via memberships collection
    if (membersListEl) membersListEl.innerHTML = '';
    const membershipsQ = query(collection(db, 'memberships'), where('groupId', '==', groupId));
    const membershipSnap = await getDocs(membershipsQ);
    const userIds = new Set();

    // add all membership userIds
    membershipSnap.forEach(ms => {
      const data = ms.data();
      if (data && data.userId) userIds.add(data.userId);
    });
    // ensure owner included
    if (ownerId) userIds.add(ownerId);

    if (userIds.size === 0) {
      if (noMembersMessage) {
        noMembersMessage.textContent = 'No members yet.';
        noMembersMessage.style.display = 'block';
      }
      return;
    }

    // fetch user profiles
    const userIdArr = Array.from(userIds);
    const memberDocs = await Promise.all(userIdArr.map(uid => getDoc(doc(db, 'users', uid))));

    let anyMember = false;
    memberDocs.forEach(uSnap => {
      if (uSnap && uSnap.exists()) {
        anyMember = true;
        const u = uSnap.data();
        const li = document.createElement('li');
        li.className = 'member-item';
        const display = u.fullName || (u.firstName ? `${u.firstName} ${u.lastName || ''}` : u.displayName || u.email || 'User');
        li.innerHTML = `<div class="member-name">${escapeHtml(display)}</div><div class="member-meta">${escapeHtml(u.email || '')}</div>`;
        membersListEl.appendChild(li);
      }
    });

    if (!anyMember && noMembersMessage) {
      noMembersMessage.textContent = 'No members yet.';
      noMembersMessage.style.display = 'block';
    } else if (noMembersMessage) {
      noMembersMessage.style.display = 'none';
    }

    // hide default no-tests message (actual test loading can be added later)
    if (noTestsMessage) noTestsMessage.style.display = 'block';
  } catch (err) {
    console.error('Failed to load group or members', err);
    alert('Failed to load group. Check console for details.');
    redirectToDashboard();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const groupId = qs('id');
  if (!groupId) {
    alert('Missing group id.');
    redirectToDashboard();
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      redirectToLanding();
      return;
    }
    loadGroupAndMembers(groupId, user);
  });
});