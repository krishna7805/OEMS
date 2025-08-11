(() => {
    // Pointer-follow background
    const root = document.documentElement;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.addEventListener('pointermove', (e) => {
        if (prefersReduced) return;
        root.style.setProperty('--pointer-x', `${e.clientX}px`);
        root.style.setProperty('--pointer-y', `${e.clientY}px`);
    });

    // Tabs
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const panelLogin = document.getElementById('panel-login');
    const panelSignup = document.getElementById('panel-signup');

    function activate(tab) {
        const isLogin = tab === 'login';
        tabLogin.classList.toggle('is-active', isLogin);
        tabSignup.classList.toggle('is-active', !isLogin);
        tabLogin.setAttribute('aria-selected', String(isLogin));
        tabSignup.setAttribute('aria-selected', String(!isLogin));
        panelLogin.hidden = !isLogin;
        panelSignup.hidden = isLogin;
        panelLogin.classList.toggle('is-active', isLogin);
        panelSignup.classList.toggle('is-active', !isLogin);
    }

    tabLogin.addEventListener('click', () => activate('login'));
    tabSignup.addEventListener('click', () => activate('signup'));

    // Message area
    const msgEl = document.getElementById('message');
    const setMessage = (text, type) => {
        msgEl.textContent = text || '';
        msgEl.className = 'message' + (type ? ` message--${type}` : '');
    };

    // Validation helpers
    const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

    // Supabase Sign In (with role retrieval)
    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) return { ok: false, error };

        const role = data.user?.user_metadata?.role || null;
        return { ok: true, token: data.session.access_token, role };
    };

    // Supabase Sign Up (storing role in metadata)
    const signUp = async (name, email, password, role) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: name, role }
            }
        });
        if (error) return { ok: false, error };
        return { ok: true, userId: data.user.id, role };
    };

    // Login form
    const loginForm = document.getElementById('loginForm');
    const loginBtn = loginForm.querySelector('button[type="submit"]');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setMessage('', null);

        const email = loginForm.email.value.trim();
        const password = loginForm.password.value;

        if (!email || !password) return setMessage('Please fill in all required fields.', 'error');
        if (!emailOk(email)) return setMessage('Please enter a valid email.', 'error');

        loginBtn.disabled = true;
        const prev = loginBtn.textContent;
        loginBtn.textContent = 'Logging in...';

        try {
            const res = await signIn(email, password);
            if (!res || !res.ok) throw new Error('Invalid credentials');

            // Store role in localStorage
            if (res.role) {
                localStorage.setItem('userRole', res.role);
            }

            setMessage('Login successful. Redirecting...', 'success');
            setTimeout(() => {
                // window.location.href = '/dashboard';
            }, 800);
        } catch {
            setMessage('Invalid credentials. Please try again.', 'error');
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = prev;
        }
    });

    // Sign up form
    const signupForm = document.getElementById('signupForm');
    const signupBtn = signupForm.querySelector('button[type="submit"]');

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setMessage('', null);

        const name = signupForm.name.value.trim();
        const email = signupForm.email.value.trim();
        const password = signupForm.password.value;
        const confirm = signupForm.confirm.value;
        const role = signupForm.role.value;

        if (!email || !password || !confirm) return setMessage('Please fill in all required fields.', 'error');
        if (!emailOk(email)) return setMessage('Please enter a valid email.', 'error');
        if (password.length < 6) return setMessage('Password must be at least 6 characters.', 'error');
        if (password !== confirm) return setMessage('Passwords do not match.', 'error');

        signupBtn.disabled = true;
        const prev = signupBtn.textContent;
        signupBtn.textContent = 'Creating account...';

        try {
            const res = await signUp(name, email, password, role);
            if (!res || !res.ok) throw new Error('Could not sign up');

            setMessage(`Sign up successful as ${role}. You can now log in.`, 'success');
            activate('login');
        } catch {
            setMessage('Could not create account. Try again.', 'error');
        } finally {
            signupBtn.disabled = false;
            signupBtn.textContent = prev;
        }
    });

    // Forgot password
    const forgotBtn = document.getElementById('forgotBtn');
    forgotBtn.addEventListener('click', () => {
        setMessage('Password reset not configured. Connect your backend to enable it.', 'success');
    });

    // Track auth state changes (store session + role)
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            const role = session.user?.user_metadata?.role || null;
            localStorage.setItem('supabaseSession', JSON.stringify(session));
            if (role) localStorage.setItem('userRole', role);
    
            // Redirect only if not already on dashboard pages
            const path = window.location.pathname;
    
            if (path.includes('auth.html') || path === '/' || path === '/index.html') {
                if (role === 'teacher') {
                    window.location.href = '/teacher-dashboard.html';
                } else if (role === 'student') {
                    window.location.href = '/student-dashboard.html';
                }
            }
        } else {
            localStorage.removeItem('supabaseSession');
            localStorage.removeItem('userRole');
        }
    });
})();