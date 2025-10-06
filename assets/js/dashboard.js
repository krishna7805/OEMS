import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    addDoc,
    setDoc,
    serverTimestamp,
    deleteDoc,
    writeBatch,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

let currentUser = null;
let profileStats = {
    createdGroups: 0,
    joinedGroups: 0,
    testsTaken: 0
};

// DOM refs
let userDisplayName;
let profileName;
let profileEmail;
let profileBioDisplay;
let profileImage;
let avatarPlaceholder;
let avatarUploadBtn;
let profileImageInput;
let editProfileBtn;
let editProfileModal;
let closeProfileModal;
let cancelProfileEdit;
let editProfileForm;
let editFirstName;
let editLastName;
let editBio;
let editPhone;
let editLocation;
let editWebsite;
let createdGroupsCount;
let joinedGroupsCount;
let testsTakenCount;
let logoutBtn;
let joinGroupForm;
let createGroupBtn;
let createdGroupsGrid;
let joinedGroupsGrid;
let noCreatedGroupsMessage;
let noJoinedGroupsMessage;
let groupCodeInput;
let takeTestForm;
let testCodeInput;
let uploadProgress;
let progressFill;
let progressText;
let saveProfileBtn;

// Utility Functions
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

function setButtonLoading(button, loading = true) {
    if (!button) return;
    
    const buttonText = button.querySelector('.button-text');
    const buttonSpinner = button.querySelector('.button-spinner');
    
    if (loading) {
        button.disabled = true;
        if (buttonText) buttonText.style.opacity = '0.7';
        if (buttonSpinner) buttonSpinner.style.display = 'block';
    } else {
        button.disabled = false;
        if (buttonText) buttonText.style.opacity = '1';
        if (buttonSpinner) buttonSpinner.style.display = 'none';
    }
}

function validateForm(formData) {
    const errors = {};
    
    if (!formData.firstName?.trim()) {
        errors.firstName = 'First name is required';
    }
    
    if (!formData.lastName?.trim()) {
        errors.lastName = 'Last name is required';
    }
    
    if (formData.phone && !/^[\+]?[1-9][\d]{0,15}$/.test(formData.phone.replace(/\s/g, ''))) {
        errors.phone = 'Please enter a valid phone number';
    }
    
    if (formData.website && !/^https?:\/\/.+\..+/.test(formData.website)) {
        errors.website = 'Please enter a valid website URL';
    }
    
    if (formData.bio && formData.bio.length > 500) {
        errors.bio = 'Bio must be less than 500 characters';
    }
    
    return errors;
}

function displayFormErrors(errors) {
    // Clear previous errors
    document.querySelectorAll('.form-error').forEach(el => el.remove());
    document.querySelectorAll('.form-group').forEach(el => {
        el.classList.remove('error', 'success');
    });
    
    // Display new errors
    Object.keys(errors).forEach(field => {
        const input = document.getElementById(`edit-${field.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
        if (input) {
            const formGroup = input.closest('.form-group');
            formGroup.classList.add('error');
            
            const errorEl = document.createElement('span');
            errorEl.className = 'form-error';
            errorEl.textContent = errors[field];
            input.parentNode.appendChild(errorEl);
        }
    });
}

function redirectToLanding() {
    window.location.href = 'index.html';
}

async function fetchUserProfile(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() ? userSnap.data() : null;
    } catch (err) {
        console.error('Error fetching user profile:', err);
        return null;
    }
}

async function updateUserProfile(updates) {
    if (!currentUser) return false;
    
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, {
            ...updates,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        // Update Firebase Auth profile if name changed
        if (updates.firstName || updates.lastName) {
            const displayName = `${updates.firstName || ''} ${updates.lastName || ''}`.trim();
            await updateProfile(currentUser, { displayName });
        }
        
        return true;
    } catch (error) {
        console.error('Error updating profile:', error);
        return false;
    }
}

async function uploadProfileImage(file) {
    if (!currentUser || !file) return null;
    
    try {
        // Show upload progress
        if (uploadProgress) uploadProgress.style.display = 'block';
        
        // Create storage reference
        const storageRef = ref(storage, `profile-images/${currentUser.uid}/${Date.now()}-${file.name}`);
        
        // Start upload
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        return new Promise((resolve, reject) => {
            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    // Progress tracking
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (progressFill) progressFill.style.width = `${progress}%`;
                    if (progressText) progressText.textContent = `${Math.round(progress)}%`;
                },
                (error) => {
                    console.error('Upload error:', error);
                    if (uploadProgress) uploadProgress.style.display = 'none';
                    reject(error);
                },
                async () => {
                    try {
                        // Upload completed successfully
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        
                        // Update user profile with new image URL
                        await updateUserProfile({ profileImageUrl: downloadURL });
                        
                        // Update UI
                        if (profileImage && avatarPlaceholder) {
                            profileImage.src = downloadURL;
                            profileImage.style.display = 'block';
                            avatarPlaceholder.style.display = 'none';
                        }
                        
                        if (uploadProgress) uploadProgress.style.display = 'none';
                        showToast('Profile picture updated successfully!', 'success');
                        resolve(downloadURL);
                    } catch (error) {
                        if (uploadProgress) uploadProgress.style.display = 'none';
                        reject(error);
                    }
                }
            );
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        if (uploadProgress) uploadProgress.style.display = 'none';
        throw error;
    }
}

async function loadProfileData() {
    if (!currentUser) return;
    
    const profile = await fetchUserProfile(currentUser.uid);
    
    // Update profile display
    if (profileName) {
        const displayName = profile?.firstName && profile?.lastName 
            ? `${profile.firstName} ${profile.lastName}`
            : currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
        profileName.textContent = displayName;
    }
    
    if (profileEmail) {
        profileEmail.textContent = currentUser.email || '';
    }
    
    // Display bio
    if (profileBioDisplay) {
        if (profile?.bio) {
            profileBioDisplay.textContent = profile.bio;
            profileBioDisplay.style.display = 'block';
        } else {
            profileBioDisplay.style.display = 'none';
        }
    }
    
    // Load profile image if exists
    if (profile?.profileImageUrl && profileImage && avatarPlaceholder) {
        profileImage.src = profile.profileImageUrl;
        profileImage.style.display = 'block';
        avatarPlaceholder.style.display = 'none';
    }
    
    // Update header display name
    if (userDisplayName) {
        const displayName = profile?.firstName 
            ? `${profile.firstName} ${profile.lastName || ''}`.trim()
            : currentUser.displayName 
            || currentUser.email?.split('@')[0] 
            || 'User';
        userDisplayName.textContent = displayName;
    }
    
    // Update stats
    await updateProfileStats();
}

async function updateProfileStats() {
    if (!currentUser) return;
    
    try {
        // Count created groups
        const createdGroupsQuery = query(
            collection(db, 'groups'), 
            where('ownerId', '==', currentUser.uid)
        );
        const createdGroupsSnap = await getDocs(createdGroupsQuery);
        profileStats.createdGroups = createdGroupsSnap.size;
        
        // Count joined groups (including owned ones)
        const membershipsQuery = query(
            collection(db, 'memberships'), 
            where('userId', '==', currentUser.uid)
        );
        const membershipsSnap = await getDocs(membershipsQuery);
        profileStats.joinedGroups = membershipsSnap.size;
        
        // TODO: Count tests taken
        // const testResultsQuery = query(
        //     collection(db, 'test-results'), 
        //     where('userId', '==', currentUser.uid)
        // );
        // const testResultsSnap = await getDocs(testResultsQuery);
        // profileStats.testsTaken = testResultsSnap.size;
        
        // Update UI
        if (createdGroupsCount) createdGroupsCount.textContent = profileStats.createdGroups;
        if (joinedGroupsCount) joinedGroupsCount.textContent = profileStats.joinedGroups;
        if (testsTakenCount) testsTakenCount.textContent = profileStats.testsTaken;
        
    } catch (error) {
        console.error('Error updating profile stats:', error);
    }
}

function openEditProfileModal() {
    if (!editProfileModal) return;
    
    // Pre-fill form with current data
    fetchUserProfile(currentUser.uid).then(profile => {
        if (editFirstName) editFirstName.value = profile?.firstName || '';
        if (editLastName) editLastName.value = profile?.lastName || '';
        if (editBio) editBio.value = profile?.bio || '';
        if (editPhone) editPhone.value = profile?.phone || '';
        if (editLocation) editLocation.value = profile?.location || '';
        if (editWebsite) editWebsite.value = profile?.website || '';
    });
    
    editProfileModal.classList.add('active');
}

function closeEditProfileModal() {
    if (editProfileModal) {
        editProfileModal.classList.remove('active');
        
        // Clear form errors
        document.querySelectorAll('.form-error').forEach(el => el.remove());
        document.querySelectorAll('.form-group').forEach(el => {
            el.classList.remove('error', 'success');
        });
    }
}

async function handleProfileImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validation
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (!allowedTypes.includes(file.type)) {
        showToast('Please select a valid image file (JPEG, PNG, GIF, or WebP)', 'error');
        return;
    }
    
    if (file.size > maxSize) {
        showToast('Image size should be less than 5MB', 'error');
        return;
    }
    
    try {
        await uploadProfileImage(file);
    } catch (error) {
        console.error('Error uploading image:', error);
        showToast('Failed to upload image. Please try again.', 'error');
    }
    
    // Clear the input
    event.target.value = '';
}

async function handleEditProfileSubmit(e) {
    e.preventDefault();
    setButtonLoading(saveProfileBtn, true);
    
    try {
        const formData = {
            firstName: editFirstName?.value.trim() || '',
            lastName: editLastName?.value.trim() || '',
            bio: editBio?.value.trim() || '',
            phone: editPhone?.value.trim() || '',
            location: editLocation?.value.trim() || '',
            website: editWebsite?.value.trim() || ''
        };
        
        // Validate form
        const errors = validateForm(formData);
        if (Object.keys(errors).length > 0) {
            displayFormErrors(errors);
            setButtonLoading(saveProfileBtn, false);
            return;
        }
        
        // Update profile
        const success = await updateUserProfile(formData);
        
        if (success) {
            await loadProfileData();
            closeEditProfileModal();
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast('Failed to update profile. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('An error occurred while updating your profile.', 'error');
    } finally {
        setButtonLoading(saveProfileBtn, false);
    }
}

// Group management functions (keeping existing functionality)
async function loadUserGroups() {
    if (!currentUser) {
        console.error('No current user');
        return;
    }
    
    console.log('Loading groups for user:', currentUser.uid);
    
    // Clear both grids
    if (createdGroupsGrid) createdGroupsGrid.innerHTML = '';
    if (joinedGroupsGrid) joinedGroupsGrid.innerHTML = '';
    
    // Show no groups messages initially
    if (noCreatedGroupsMessage) noCreatedGroupsMessage.style.display = 'block';
    if (noJoinedGroupsMessage) noJoinedGroupsMessage.style.display = 'block';

    try {
        // Get all memberships for the current user
        const membershipQ = query(collection(db, 'memberships'), where('userId', '==', currentUser.uid));
        const membershipSnap = await getDocs(membershipQ);
        
        console.log('Found memberships:', membershipSnap.size);
        
        if (membershipSnap.empty) {
            console.log('No memberships found');
            return;
        }

        // Collect unique group IDs
        const groupIdSet = new Set();
        membershipSnap.forEach(docSnap => {
            const data = docSnap.data();
            console.log('Membership data:', data);
            if (data.groupId) groupIdSet.add(data.groupId);
        });

        console.log('Unique group IDs:', Array.from(groupIdSet));

        if (groupIdSet.size === 0) return;

        // Fetch all groups
        const groups = [];
        for (const id of Array.from(groupIdSet)) {
            try {
                const gSnap = await getDoc(doc(db, 'groups', id));
                if (gSnap.exists()) {
                    console.log('Group found:', id, gSnap.data());
                    groups.push({ id: gSnap.id, ...gSnap.data() });
                } else {
                    console.warn('Group not found:', id);
                }
            } catch (err) {
                console.error('Failed to fetch group', id, err);
            }
        }

        console.log('Total groups loaded:', groups.length);

        if (groups.length === 0) {
            console.warn('No valid groups found');
            return;
        }

        // Separate created and joined groups
        const createdGroups = groups.filter(g => g.ownerId === currentUser.uid);
        const joinedGroups = groups.filter(g => g.ownerId !== currentUser.uid);

        console.log('Created groups:', createdGroups.length);
        console.log('Joined groups:', joinedGroups.length);

        // Render created groups
        if (createdGroups.length > 0) {
            if (noCreatedGroupsMessage) noCreatedGroupsMessage.style.display = 'none';
            if (createdGroupsGrid) {
                createdGroupsGrid.innerHTML = createdGroups
                    .map(g => renderGroupCard(g, true))
                    .join('');
                attachGroupEventListeners(createdGroupsGrid);
            }
        }

        // Render joined groups
        if (joinedGroups.length > 0) {
            if (noJoinedGroupsMessage) noJoinedGroupsMessage.style.display = 'none';
            if (joinedGroupsGrid) {
                joinedGroupsGrid.innerHTML = joinedGroups
                    .map(g => renderGroupCard(g, false))
                    .join('');
                attachGroupEventListeners(joinedGroupsGrid);
            }
        }

        // Update profile stats
        await updateProfileStats();
        
    } catch (err) {
        console.error('Error loading groups:', err);
        showToast(`Error loading groups: ${err.message}`, 'error');
    }
}

function renderGroupCard(group, isOwner) {
    const tests = typeof group.testsCount === 'number' ? group.testsCount : (group.testsCount ? Number(group.testsCount) : 0);
    
    // Only show delete button for owned groups
    const deleteButton = isOwner ? `
        <button type="button" class="group-manage-btn" title="Delete group" aria-label="Delete group">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        </button>
    ` : '';

    // Show owner badge for created groups, member badge for joined groups
    const badge = isOwner ? 
        '<span class="group-role-badge owner-badge">Owner</span>' : 
        '<span class="group-role-badge member-badge">Member</span>';

    return `
        <div class="group-card" data-group-id="${escapeHtml(group.id)}">
            <div class="group-header">
                <div class="group-icon ${group.gradient || 'primary-gradient'}">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                    ${badge}
                    ${deleteButton}
                </div>
            </div>

            <div class="group-info">
                <h3>${escapeHtml(group.name || 'Untitled Group')}</h3>
                <div class="group-meta">
                    <span>${group.membersCount || 0} members</span>
                </div>
                <div class="group-code-wrap">
                    <span class="code-label">Code:</span>
                    <span class="group-code">${escapeHtml(group.code || '')}</span>
                </div>
            </div>
            
            <div class="group-stats">
                <div class="group-tests">
                    <span class="group-tests-label">Tests:</span>
                    <span class="group-tests-value">${tests}</span>
                </div>
            </div>
        </div>
    `;
}

function attachGroupEventListeners(gridContainer) {
    // Group card click handlers
    gridContainer.querySelectorAll('.group-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't navigate if clicking on the delete button
            if (e.target.closest('.group-manage-btn')) return;
            
            const groupId = card.dataset.groupId;
            if (!currentUser) {
                window.location.href = 'index.html';
                return;
            }
            window.location.href = `groups.html?id=${encodeURIComponent(groupId)}`;
        });
    });

    // Delete button handlers
    gridContainer.querySelectorAll('.group-manage-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupId = btn.closest('.group-card')?.dataset.groupId;
            if (!groupId) return;
            handleDeleteGroup(groupId);
        });
    });
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
    if (!code) {
        showToast('Please enter a group code', 'error');
        return;
    }

    try {
        // Find group by code
        const q = query(collection(db, 'groups'), where('code', '==', code));
        const snap = await getDocs(q);
        if (snap.empty) {
            showToast('Group not found. Please check the code.', 'error');
            return;
        }

        const g = snap.docs[0];
        const groupId = g.id;

        // Check existing membership for this user and group
        const memQ = query(collection(db, 'memberships'),
                           where('userId', '==', currentUser.uid),
                           where('groupId', '==', groupId));
        const memSnap = await getDocs(memQ);
        if (!memSnap.empty) {
            groupCodeInput.value = '';
            showToast('You are already a member of this group', 'info');
            return;
        }

        await addDoc(collection(db, 'memberships'), {
            userId: currentUser.uid,
            groupId,
            role: 'member',
            joinedAt: serverTimestamp()
        });

        groupCodeInput.value = '';
        await loadUserGroups();
        showToast('Successfully joined the group!', 'success');
    } catch (err) {
        console.error('Error joining group:', err);
        showToast('Failed to join group. Please try again.', 'error');
    }
}

async function handleCreateGroup() {
    const name = prompt('Enter a name for the new group:');
    if (!name || !name.trim()) return;
    if (!currentUser) {
        showToast('You must be logged in to create a group', 'error');
        return;
    }

    try {
        const code = generateGroupCode();
        
        // Create group first
        const grpRef = await addDoc(collection(db, 'groups'), {
            name: name.trim(),
            ownerId: currentUser.uid,
            code,
            membersCount: 1,
            testsCount: 0,
            createdAt: serverTimestamp(),
            showMembersToAll: true // Add default setting
        });

        // Then add owner as member (no need to check existence)
        await addDoc(collection(db, 'memberships'), {
            userId: currentUser.uid,
            groupId: grpRef.id,
            role: 'owner',
            joinedAt: serverTimestamp()
        });

        await loadUserGroups();
        showToast(`Group created successfully! Code: ${code}`, 'success');
    } catch (err) {
        console.error('Error creating group:', err);
        showToast(`Failed to create group: ${err.message}`, 'error');
    }
}

async function handleDeleteGroup(groupId) {
    if (!currentUser) {
        showToast('You must be logged in to delete a group', 'error');
        return;
    }

    try {
        const gRef = doc(db, 'groups', groupId);
        const gSnap = await getDoc(gRef);
        if (!gSnap.exists()) {
            showToast('Group not found', 'error');
            return;
        }
        
        const group = gSnap.data();
        const ownerId = group.ownerId || group.owner || null;
        if (ownerId !== currentUser.uid) {
            showToast('Only the group owner can delete this group', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
            return;
        }

        // Delete all membership docs for this group using a batch
        const memQ = query(collection(db, 'memberships'), where('groupId', '==', groupId));
        const memSnap = await getDocs(memQ);

        const batch = writeBatch(db);
        memSnap.forEach(ms => {
            batch.delete(ms.ref);
        });
        batch.delete(gRef);

        await batch.commit();

        // Reload the groups to update both sections
        await loadUserGroups();
        showToast('Group deleted successfully', 'success');
    } catch (err) {
        console.error('Failed to delete group:', err);
        showToast('Failed to delete group. Please try again.', 'error');
    }
}

function generateGroupCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function handleLogout() {
    try {
        await signOut(auth);
        redirectToLanding();
    } catch (err) {
        console.error('Logout error:', err);
        showToast('Failed to logout. Please try again.', 'error');
    }
}

function handleTakeTest(e) {
    e.preventDefault();
    if (!testCodeInput) return;
    const code = testCodeInput.value.trim();
    if (!code) {
        showToast('Please enter a test code', 'error');
        return;
    }
    
    // Navigate to test taking page
    window.location.href = `take-test.html?code=${encodeURIComponent(code)}`;
}


// ...existing code...

async function ensureUserDocument(user) {
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            console.log('Creating user document for:', user.uid);
            await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName || '',
                firstName: '',
                lastName: '',
                bio: '',
                phone: '',
                location: '',
                website: '',
                profileImageUrl: '',
                createdAt: serverTimestamp()
            });
        }
    } catch (err) {
        console.error('Error ensuring user document:', err);
    }
}

function init() {

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            redirectToLanding();
            return;
        }
        
        currentUser = user;
        
        // Ensure user document exists
        await ensureUserDocument(user);
        
        // ...rest of existing code...
        await loadProfileData();
        await loadUserGroups();
    });
    // Get DOM elements
    // Add this temporarily in dashboard.js init()
    
    
    // console.log('Auth:', auth);
    // console.log('DB:', db);
    // console.log('Current User:', currentUser);


    userDisplayName = document.getElementById('user-display-name');
    profileName = document.getElementById('profile-name');
    profileEmail = document.getElementById('profile-email');
    profileBioDisplay = document.getElementById('profile-bio-display');
    profileImage = document.getElementById('profile-image');
    avatarPlaceholder = document.getElementById('avatar-placeholder');
    avatarUploadBtn = document.getElementById('avatar-upload-btn');
    profileImageInput = document.getElementById('profile-image-input');
    editProfileBtn = document.getElementById('edit-profile-btn');
    editProfileModal = document.getElementById('edit-profile-modal');
    closeProfileModal = document.getElementById('close-profile-modal');
    cancelProfileEdit = document.getElementById('cancel-profile-edit');
    editProfileForm = document.getElementById('edit-profile-form');
    editFirstName = document.getElementById('edit-first-name');
    editLastName = document.getElementById('edit-last-name');
    editBio = document.getElementById('edit-bio');
    editPhone = document.getElementById('edit-phone');
    editLocation = document.getElementById('edit-location');
    editWebsite = document.getElementById('edit-website');
    createdGroupsCount = document.getElementById('created-groups-count');
    joinedGroupsCount = document.getElementById('joined-groups-count');
    testsTakenCount = document.getElementById('tests-taken-count');
    logoutBtn = document.getElementById('logout-btn');
    joinGroupForm = document.getElementById('join-group-form');
    groupCodeInput = document.getElementById('group-code-input');
    takeTestForm = document.getElementById('take-test-form');
    testCodeInput = document.getElementById('test-code-input');
    createGroupBtn = document.getElementById('create-group-btn');
    createdGroupsGrid = document.getElementById('created-groups-grid');
    joinedGroupsGrid = document.getElementById('joined-groups-grid');
    noCreatedGroupsMessage = document.getElementById('no-created-groups-message');
    noJoinedGroupsMessage = document.getElementById('no-joined-groups-message');
    uploadProgress = document.getElementById('upload-progress');
    progressFill = document.getElementById('progress-fill');
    progressText = document.getElementById('progress-text');
    saveProfileBtn = document.getElementById('save-profile-btn');

   
   // Add after init() function
window.debugFirestore = async function() {
    console.log('=== FIRESTORE DEBUG ===');
    console.log('Current User:', currentUser);
    
    try {
        const groupsSnap = await getDocs(collection(db, 'groups'));
        console.log('All groups:', groupsSnap.size);
        groupsSnap.forEach(doc => console.log(doc.id, doc.data()));
        
        const membershipsSnap = await getDocs(collection(db, 'memberships'));
        console.log('All memberships:', membershipsSnap.size);
        membershipsSnap.forEach(doc => console.log(doc.id, doc.data()));
    } catch (err) {
        console.error('Debug error:', err);
    }
};
   
    // Auth state listener
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            redirectToLanding();
            return;
        }
        currentUser = user;

        await loadProfileData();
        await loadUserGroups();
    });

    // Event listeners
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (joinGroupForm) joinGroupForm.addEventListener('submit', handleJoinGroup);
    if (createGroupBtn) createGroupBtn.addEventListener('click', handleCreateGroup);
    if (takeTestForm) takeTestForm.addEventListener('submit', handleTakeTest);
    
    // Profile modal event listeners
    if (editProfileBtn) editProfileBtn.addEventListener('click', openEditProfileModal);
    if (closeProfileModal) closeProfileModal.addEventListener('click', closeEditProfileModal);
    if (cancelProfileEdit) cancelProfileEdit.addEventListener('click', closeEditProfileModal);
    if (editProfileForm) editProfileForm.addEventListener('submit', handleEditProfileSubmit);
    if (avatarUploadBtn) avatarUploadBtn.addEventListener('click', () => profileImageInput?.click());
    if (profileImageInput) profileImageInput.addEventListener('change', handleProfileImageUpload);
    
    // Close modal when clicking overlay
    if (editProfileModal) {
        editProfileModal.addEventListener('click', (e) => {
            if (e.target === editProfileModal) closeEditProfileModal();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}