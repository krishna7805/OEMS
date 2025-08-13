// --- Configuration ---
// IMPORTANT: Replace this with your actual Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwVJy40xVo5hpdANMvHupehUgBPIh2E0OwiklDshIivBps7_9cEoieLzKTqS9Hf6gQj/exec'; 

// --- DOM Element Selection ---
const showLoginBtn = document.getElementById('show-login');
const showSignupBtn = document.getElementById('show-signup');
const toggleSlider = document.getElementById('toggle-slider');

const loginFormContainer = document.getElementById('login-form');
const signupFormContainer = document.getElementById('signup-form');
const otpFormContainer = document.getElementById('otp-form');

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const otpForm = document.getElementById('otpForm');

const backToSignupBtn = document.getElementById('back-to-signup');
const otpInputsContainer = document.getElementById('otp-inputs');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');

// Store signup data temporarily
let tempSignupData = {};

// --- UI Functions ---
function showForm(formToShow, buttonToActivate) {
    [loginFormContainer, signupFormContainer, otpFormContainer].forEach(form => {
        form.classList.remove('form-visible');
        form.classList.add('form-hidden');
    });
    
    formToShow.classList.remove('form-hidden');
    formToShow.classList.add('form-visible');

    if (buttonToActivate === showLoginBtn) {
        toggleSlider.style.left = '0.25rem';
        showLoginBtn.classList.add('active');
        showSignupBtn.classList.remove('active');
    } else {
        toggleSlider.style.left = 'calc(50% - 0.25rem)';
        showSignupBtn.classList.add('active');
        showLoginBtn.classList.remove('active');
    }
}

function showMessage(message, isError = false) {
    messageText.textContent = message;
    messageBox.className = 'message-box-visible';
    if (isError) {
        messageBox.classList.add('message-box-error');
    } else {
        messageBox.classList.add('message-box-success');
    }

    setTimeout(() => {
        messageBox.className = 'message-box-hidden';
    }, 4000);
}

// --- Event Listeners ---
showLoginBtn.addEventListener('click', () => showForm(loginFormContainer, showLoginBtn));
showSignupBtn.addEventListener('click', () => showForm(signupFormContainer, showSignupBtn));
backToSignupBtn.addEventListener('click', () => showForm(signupFormContainer, showSignupBtn));

// --- Form Submission Logic ---

// 1. Sign Up Form Submission
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(signupForm);
    tempSignupData = Object.fromEntries(formData.entries());

    showMessage('Checking user details...', false);

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'sendOTP',
                email: tempSignupData.email,
                name: tempSignupData.name
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('OTP sent to your email!', false);
            showForm(otpFormContainer, showSignupBtn);
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        showMessage('Failed to send OTP. Please try again.', true);
    }
});

// 2. OTP Form Submission
otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otpInputs = otpInputsContainer.querySelectorAll('input');
    const otp = Array.from(otpInputs).map(input => input.value).join('');

    if (otp.length !== 6) {
        showMessage('Please enter a 6-digit OTP.', true);
        return;
    }
    
    showMessage('Verifying OTP...', false);

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'verifyOTPAndSignUp',
                email: tempSignupData.email,
                otp: otp,
                userData: tempSignupData // Send all user data for storage
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('Account created successfully! Please log in.', false);
            signupForm.reset();
            otpForm.reset();
            showForm(loginFormContainer, showLoginBtn);
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        showMessage('Failed to verify OTP. Please try again.', true);
    }
});

// 3. Login Form Submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const loginData = Object.fromEntries(formData.entries());

    showMessage('Logging in...', false);

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login',
                username: loginData.username,
                password: loginData.password
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage(`Welcome back, ${result.name}!`, false);
            // Here you would typically redirect the user to their dashboard
            // window.location.href = '/dashboard';
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        console.error('Error during login:', error);
        showMessage('Login failed. Please check your credentials.', true);
    }
});


// --- OTP Input Handling ---
otpInputsContainer.addEventListener('input', (e) => {
    const target = e.target;
    if (target.value.length === 1 && target.nextElementSibling) {
        target.nextElementSibling.focus();
    }
});

otpInputsContainer.addEventListener('keyup', (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
        if (e.target.value === '' && e.target.previousElementSibling) {
            e.target.previousElementSibling.focus();
        }
    }
});

// --- Radio Button Custom Styling Logic ---
const roleRadios = document.querySelectorAll('input[name="role"]');
roleRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        roleRadios.forEach(r => {
            const label = r.parentElement;
            if (r.checked) {
                label.style.borderColor = '#2563eb';
                label.style.backgroundColor = '#eff6ff';
            } else {
                label.style.borderColor = '#d1d5db';
                label.style.backgroundColor = 'transparent';
            }
        });
    });
    // Set initial state
    if(radio.checked) {
       const label = radio.parentElement;
       label.style.borderColor = '#2563eb';
       label.style.backgroundColor = '#eff6ff';
    }
});

// Initialize with the login form visible
showForm(loginFormContainer, showLoginBtn);
