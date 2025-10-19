import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Landing Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const mobileToggle = document.getElementById('mobile-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');
    const flipCard = document.getElementById('flip-card');

    // Auth triggers
    const navAuthBtn = document.getElementById('nav-auth-btn');
    const mobileAuthBtn = document.getElementById('mobile-auth-btn');
    const heroAuthBtn = document.getElementById('hero-auth-btn');
    const ctaAuthBtn = document.getElementById('cta-auth-btn');

    // Modal controls
    const showSignupBtn = document.getElementById('show-signup');
    const showLoginBtn = document.getElementById('show-login');

    // Forms
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    // Google Sign-In buttons
    const googleLoginBtn = document.getElementById('google-login-btn');
    const googleSignupBtn = document.getElementById('google-signup-btn');

    // Password toggles
    const loginPasswordToggle = document.getElementById('login-password-toggle');
    const signupPasswordToggle = document.getElementById('signup-password-toggle');
    const confirmPasswordToggle = document.getElementById('confirm-password-toggle');

    // Defensive safe event adder
    function safeAddEvent(el, evt, handler) {
        if (!el) return;
        el.addEventListener(evt, handler);
    }

    // Mobile menu toggling
    safeAddEvent(mobileToggle, 'click', () => {
        if (mobileToggle) mobileToggle.classList.toggle('active');
        if (mobileMenu) mobileMenu.classList.toggle('active');
    });

    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (mobileToggle) mobileToggle.classList.remove('active');
            if (mobileMenu) mobileMenu.classList.remove('active');
        });
    });

    safeAddEvent(mobileAuthBtn, 'click', () => {
        if (mobileToggle) mobileToggle.classList.remove('active');
        if (mobileMenu) mobileMenu.classList.remove('active');
        openModal();
    });

    // Modal open/close
    function openModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (flipCard) flipCard.classList.remove('flipped');
    }

    function closeModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        document.body.style.overflow = 'auto';
        if (loginForm) loginForm.reset();
        if (signupForm) signupForm.reset();
        if (flipCard) flipCard.classList.remove('flipped');
    }

    safeAddEvent(navAuthBtn, 'click', openModal);
    safeAddEvent(heroAuthBtn, 'click', openModal);
    safeAddEvent(ctaAuthBtn, 'click', openModal);
    safeAddEvent(modalClose, 'click', closeModal);

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
            closeModal();
        }
    });

    // Flip between login/signup
    function flipToSignup() {
        if (flipCard) flipCard.classList.add('flipped');
        if (loginForm) loginForm.reset();
    }
    function flipToLogin() {
        if (flipCard) flipCard.classList.remove('flipped');
        if (signupForm) signupForm.reset();
    }
    safeAddEvent(showSignupBtn, 'click', (e) => { 
        if (e) e.preventDefault(); 
        flipToSignup(); 
    });
    safeAddEvent(showLoginBtn, 'click', (e) => { 
        if (e) e.preventDefault(); 
        flipToLogin(); 
    });

    // Password toggles
    function togglePassword(inputId, toggleBtn) {
        const input = document.getElementById(inputId);
        if (!input || !toggleBtn) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggleBtn.classList.toggle('show-password', show);
    }
    safeAddEvent(loginPasswordToggle, 'click', () => togglePassword('login-password', loginPasswordToggle));
    safeAddEvent(signupPasswordToggle, 'click', () => togglePassword('signup-password', signupPasswordToggle));
    safeAddEvent(confirmPasswordToggle, 'click', () => togglePassword('confirm-password', confirmPasswordToggle));

    // Button loading UX
    function addButtonLoading(button) {
        if (!button) return () => {};
        const original = button.innerHTML;
        button.innerHTML = '<span>Loading...</span>';
        button.disabled = true;
        return () => {
            button.innerHTML = original;
            button.disabled = false;
        };
    }

    // Redirect helper
    function redirectToDashboard() {
        window.location.href = 'dashboard.html';
    }

    function isLandingPage() {
        const p = window.location.pathname.split('/').pop();
        return (!p || p === '' || p === 'index.html');
    }

    // Google Sign-In Handler
    async function handleGoogleSignIn(button) {
        if (!button) return;
        
        const restore = addButtonLoading(button);
        const provider = new GoogleAuthProvider();

        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            console.log('Google Sign-In successful:', user.displayName);
            restore();
            closeModal();
            redirectToDashboard();
        } catch (error) {
            restore();
            console.error('Google Sign-In error:', error);
            
            // Handle specific errors
            if (error.code === 'auth/popup-closed-by-user') {
                // User closed the popup, do nothing
                return;
            } else if (error.code === 'auth/cancelled-popup-request') {
                // Another popup was triggered, ignore
                return;
            } else {
                alert(error.message || 'Google Sign-In failed. Please try again.');
            }
        }
    }

    // Google Sign-In button event listeners
    safeAddEvent(googleLoginBtn, 'click', () => handleGoogleSignIn(googleLoginBtn));
    safeAddEvent(googleSignupBtn, 'click', () => handleGoogleSignIn(googleSignupBtn));

    // Observe auth state and redirect if authenticated and on landing
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (navAuthBtn) navAuthBtn.textContent = 'Dashboard';
            if (isLandingPage()) redirectToDashboard();
        } else {
            if (navAuthBtn) navAuthBtn.textContent = 'Get Started';
        }
    });

    // Login form handler
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = new FormData(loginForm);
            const email = (form.get('email') || '').toString().trim();
            const password = (form.get('password') || '').toString();

            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const restore = addButtonLoading(submitBtn);

            if (!email || !password) {
                restore();
                alert('Please provide email and password.');
                return;
            }

            signInWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    restore();
                    closeModal();
                    redirectToDashboard();
                })
                .catch((error) => {
                    restore();
                    console.error('Sign-in error:', error);
                    
                    // User-friendly error messages
                    let errorMessage = 'Sign-in failed. Please try again.';
                    if (error.code === 'auth/user-not-found') {
                        errorMessage = 'No account found with this email.';
                    } else if (error.code === 'auth/wrong-password') {
                        errorMessage = 'Incorrect password.';
                    } else if (error.code === 'auth/invalid-email') {
                        errorMessage = 'Invalid email address.';
                    } else if (error.code === 'auth/invalid-credential') {
                        errorMessage = 'Invalid email or password.';
                    }
                    
                    alert(errorMessage);
                });
        });
    }

    // Signup form handler
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = new FormData(signupForm);
            const fullName = (form.get('fullName') || '').toString().trim();
            const email = (form.get('email') || '').toString().trim();
            const password = (form.get('password') || '').toString();
            const confirmPassword = (form.get('confirmPassword') || '').toString();

            const submitBtn = signupForm.querySelector('button[type="submit"]');
            const restore = addButtonLoading(submitBtn);

            if (!email || !password || !confirmPassword) {
                restore();
                alert('Please complete all required fields.');
                return;
            }
            if (password !== confirmPassword) {
                restore();
                alert('Passwords do not match!');
                return;
            }
            if (password.length < 6) {
                restore();
                alert('Password must be at least 6 characters long!');
                return;
            }

            createUserWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    if (fullName) {
                        return updateProfile(user, { displayName: fullName })
                            .then(() => {
                                restore();
                                closeModal();
                                redirectToDashboard();
                            });
                    } else {
                        restore();
                        closeModal();
                        redirectToDashboard();
                    }
                })
                .catch((error) => {
                    restore();
                    console.error('Signup error:', error);
                    
                    // User-friendly error messages
                    let errorMessage = 'Signup failed. Please try again.';
                    if (error.code === 'auth/email-already-in-use') {
                        errorMessage = 'This email is already registered. Please sign in instead.';
                    } else if (error.code === 'auth/invalid-email') {
                        errorMessage = 'Invalid email address.';
                    } else if (error.code === 'auth/weak-password') {
                        errorMessage = 'Password is too weak. Use at least 6 characters.';
                    }
                    
                    alert(errorMessage);
                });
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Close mobile menu if open
                if (mobileToggle) mobileToggle.classList.remove('active');
                if (mobileMenu) mobileMenu.classList.remove('active');
            }
        });
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in-section').forEach(el => {
        observer.observe(el);
    });
});