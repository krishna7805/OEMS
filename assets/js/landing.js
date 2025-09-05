// ...existing code...
import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Landing Page JavaScript - complete file

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements (guarded)
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
        if (signupForm) signupForm.reset();
    }
    function flipToLogin() {
        if (flipCard) flipCard.classList.remove('flipped');
        if (loginForm) loginForm.reset();
        if (signupForm) signupForm.reset();
    }
    safeAddEvent(showSignupBtn, 'click', (e) => { e && e.preventDefault(); flipToSignup(); });
    safeAddEvent(showLoginBtn, 'click', (e) => { e && e.preventDefault(); flipToLogin(); });

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
        const original = button.textContent;
        button.textContent = 'Loading...';
        button.disabled = true;
        return () => {
            button.textContent = original;
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

            const submitBtn = loginForm.querySelector('button[type="submit"]') || loginForm.querySelector('button');
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
                    alert(error.message || 'Sign-in failed');
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

            const submitBtn = signupForm.querySelector('button[type="submit"]') || signupForm.querySelector('button');
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
                        updateProfile(user, { displayName: fullName }).catch((err) => {
                            console.warn('Failed to set displayName:', err);
                        });
                    }
                    restore();
                    closeModal();
                    redirectToDashboard();
                })
                .catch((error) => {
                    restore();
                    console.error('Signup error:', error);
                    alert(error.message || 'Signup failed');
                });
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const offsetTop = Math.max(target.offsetTop - 80, 0);
                window.scrollTo({ top: offsetTop, behavior: 'smooth' });
            }
        });
    });

    // Fade-in on scroll
    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });

    // Staggered animation delays
    document.querySelectorAll('.feature-card').forEach((card, i) => card.style.animationDelay = `${i * 0.1}s`);
    document.querySelectorAll('.step-card').forEach((card, i) => card.style.animationDelay = `${i * 0.2}s`);

    // Neumorphic button press effects
    document.querySelectorAll('.neu-button, .btn-primary').forEach(button => {
        button.addEventListener('mousedown', function() {
            this.style.transform = 'translateY(2px)';
            this.style.boxShadow = 'var(--shadow-neumorphic-inset)';
        });
        ['mouseup','mouseleave'].forEach(evt => button.addEventListener(evt, function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        }));
    });

    // Parallax for floating elements
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        document.querySelectorAll('.floating').forEach(el => {
            const speed = parseFloat(el.getAttribute('data-speed')) || 0.5;
            el.style.transform = `translateY(${-(scrolled * speed)}px)`;
        });
    });

    // Card hover effects
    document.querySelectorAll('.neu-card, .feature-card, .step-content, .exam-card, .cta-card').forEach(card => {
        card.addEventListener('mouseenter', function() { this.style.transform = 'translateY(-5px)'; });
        card.addEventListener('mouseleave', function() { this.style.transform = ''; });
    });

    // Form inputs focused/has-value styling
    document.querySelectorAll('.form-input').forEach(input => {
        input.addEventListener('focus', function() { if (this.parentNode) this.parentNode.classList.add('focused'); });
        input.addEventListener('blur', function() { if (!this.value && this.parentNode) this.parentNode.classList.remove('focused'); });
        input.addEventListener('input', function() { if (this.value) this.parentNode.classList.add('has-value'); else this.parentNode.classList.remove('has-value'); });
    });

    // Ripple effect
    function createRipple(event) {
        const button = event.currentTarget;
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;
        circle.style.width = circle.style.height = `${diameter}px`;
        const rect = button.getBoundingClientRect();
        circle.style.left = `${event.clientX - rect.left - radius}px`;
        circle.style.top = `${event.clientY - rect.top - radius}px`;
        circle.className = 'ripple';
        const existing = button.getElementsByClassName('ripple')[0];
        if (existing) existing.remove();
        button.appendChild(circle);
    }
    document.querySelectorAll('.btn-primary').forEach(btn => btn.addEventListener('click', createRipple));

    // Console welcome
    console.log('%c🚀 ExamPlatform Landing Page Loaded Successfully!', 'color: #667eea; font-size: 16px; font-weight: bold;');
});