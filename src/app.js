// ============================================
// EMPROIUMVIPANI - COMPLETE APP.JS
// Alpine.js Store + Logic (Production-Ready)
// ============================================

// Import Alpine (already loaded via CDN)
// window.Alpine is available globally

// ============================================
// 1. GLOBAL STORE (Redux-like State Management)
// ============================================
class AppStore {
    constructor() {
        this.state = {
            // User & Auth
            user: null,
            isLoggedIn: false,
            sessionExpiresAt: null,
            auth: {
                // For OTP + key flow
                otpRequestId: null,
                otpStage: 'idle', // 'idle' | 'awaiting_otp' | 'set_key' | 'login_with_key'
                identifier: '',   // email or phone used for login
                // Session management
                sessionWarningShown: false,
                showSessionExtend: false
            },

            // Account & dashboard data
            account: {
                view: 'overview', // 'overview' | 'orders' | 'seller' | 'bookkeeping'
                profile: null,
                orders: [],
                sellerProducts: [],
                adminDashboard: null,
                pendingSellers: [],
                loading: {
                    profile: false,
                    orders: false,
                    seller: false,
                    admin: false
                }
            },
            
            // Cart
            cart: [],
            cartOpen: false,
            
            // Products & Filters
            products: [],
            sellers: [],
            filteredProducts: [],
            filters: {
                category: 'all',
                search: '',
                sortBy: 'relevance'
            },
            selectedProduct: null,
            
            // UI State
            modals: {
                seller: false,
                login: false,
                cart: false,
                checkout: false
            },
            
            // Loading States
            loading: {
                products: false,
                checkout: false,
                order: false
            },
            
            // Order Confirmation
            lastOrder: null,
            
            // Mobile
            mobileMenuOpen: false
        };
        
        this.listeners = [];
        this.init();
    }
    
    init() {
        this.loadFromStorage();
        this.loadInitialData();
    }
    
    // ========== Initial Data Loading (API-first with graceful fallback) ==========
    async loadInitialData() {
        // Try loading from backend API first; fall back to local seed data on failure
        this.state.loading.products = true;
        this.notify();

        try {
            const api = window.api;

            if (!api || typeof api.getProducts !== 'function' || typeof api.getSellers !== 'function') {
                console.warn('⚠️ API service not available, using local seed data');
                this.seedData();
                return;
            }

            const [productsResponse, sellersResponse] = await Promise.all([
                api.getProducts({ limit: 60 }),
                api.getSellers('approved')
            ]);

            const rawProducts = productsResponse?.data || [];
            const rawSellers = sellersResponse?.data || [];

            // Normalize sellers
            const sellers = rawSellers.map((s) => ({
                id: s._id,
                name: s.name,
                status: s.seller?.status || 'approved',
                rating: 0,
                desc: s.seller?.description || '',
                avatar: (s.name || 'S').charAt(0).toUpperCase(),
                verified: !!s.seller?.verified,
                location: s.seller?.businessType || 'Seller'
            }));

            // Index sellers by id for quick lookup
            const sellerMap = new Map(sellers.map((s) => [String(s.id), s]));

            // Normalize products into the shape the UI expects
            const products = rawProducts.map((p) => {
                const sellerId = (p.sellerId && (p.sellerId._id || p.sellerId)) || null;
                const seller = sellerMap.get(String(sellerId));

                // Choose a simple emoji avatar based on category if thumbnail is not present
                const defaultEmojiByCategory = {
                    'Natural Products': '🌿',
                    'Stationery': '📓',
                    'Worksheets': '📚',
                    'Electronics': '💻',
                    'Fashion': '👗',
                    'Home & Kitchen': '🏠',
                    'Books': '📖',
                    'Toys & Games': '🎮',
                    'Health & Beauty': '💊',
                    'Sports & Outdoors': '⚽',
                    'Grocery': '🛒',
                    'Automotive': '🚗',
                    'Art & Crafts': '🎨',
                    'Baby Products': '🍼',
                    'Office Supplies': '🖊',
                    'Other': '📦'
                };

                return {
                    id: p._id,
                    name: p.name,
                    price: p.price,
                    sellerId: seller ? seller.id : sellerId,
                    category: p.category || 'Other',
                    image: p.thumbnail || defaultEmojiByCategory[p.category] || '🛒',
                    stock: p.stock ?? 0,
                    rating: p.rating?.average ?? 0,
                    sales: p.sales ?? 0,
                    description: p.description || ''
                };
            });

            this.state.sellers = sellers;
            this.state.products = products;
            this.state.filteredProducts = [...products];
            this.filterProducts();
        } catch (error) {
            console.error('❌ Failed to load products from API, using local seed data instead:', error);
            this.showToast('Unable to connect to marketplace server. Showing demo catalogue.', 'warning');
            this.seedData();
        } finally {
            this.state.loading.products = false;
            this.notify();
        }
    }
    
    // ========== Storage Management ==========
    loadFromStorage() {
        const saved = localStorage.getItem('emproium_cart');
        const userSaved = localStorage.getItem('emproium_user');
        const sessionExpiry = localStorage.getItem('emproium_session_expires_at');
        
        if (saved) {
            try {
                this.state.cart = JSON.parse(saved);
            } catch (e) {
                console.error('Cart load error:', e);
            }
        }
        
        if (userSaved) {
            try {
                this.state.user = JSON.parse(userSaved);
                this.state.isLoggedIn = true;
            } catch (e) {
                console.error('User load error:', e);
            }
        }

        if (sessionExpiry) {
            const expiry = Number(sessionExpiry);
            if (!Number.isNaN(expiry) && expiry > Date.now()) {
                this.state.sessionExpiresAt = expiry;
            } else {
                // Expired stored session
                this.logout();
            }
        }
    }
    
    saveToStorage() {
        localStorage.setItem('emproium_cart', JSON.stringify(this.state.cart));
        if (this.state.user) {
            localStorage.setItem('emproium_user', JSON.stringify(this.state.user));
        }
        if (this.state.sessionExpiresAt) {
            localStorage.setItem('emproium_session_expires_at', String(this.state.sessionExpiresAt));
        } else {
            localStorage.removeItem('emproium_session_expires_at');
        }
    }
    
    // ========== Data Seeding ==========
    seedData() {
        this.state.sellers = [
            { 
                id: 1, 
                name: 'Triu Naturals Pvt Ltd', 
                status: 'approved', 
                rating: 4.85, 
                desc: 'Premium herbal powders & spices',
                avatar: '👨‍🌾',
                verified: true,
                location: 'Delhi'
            },
            { 
                id: 2, 
                name: 'Aurora Quill Designs', 
                status: 'approved', 
                rating: 4.92, 
                desc: 'Luxury stationery collections',
                avatar: '✍️',
                verified: true,
                location: 'Mumbai'
            },
            { 
                id: 3, 
                name: 'EduSpark Worksheets', 
                status: 'approved', 
                rating: 4.76, 
                desc: 'STEM & skill-building resources',
                avatar: '📚',
                verified: true,
                location: 'Bangalore'
            },
            { 
                id: 4, 
                name: 'GreenLeaf Organics', 
                status: 'pending', 
                rating: 0, 
                desc: 'Organic superfoods',
                avatar: '🌱',
                verified: false,
                location: 'Pune'
            }
        ];
        
        this.state.products = [
            {
                id: 1,
                name: 'Organic Turmeric Powder 500g',
                price: 299,
                sellerId: 1,
                category: 'Natural Products',
                image: '🧂',
                stock: 124,
                rating: 4.9,
                sales: 567,
                description: 'Pure, organic turmeric powder from trusted farmers'
            },
            {
                id: 2,
                name: 'Premium Leather-Bound Diary',
                price: 1299,
                sellerId: 2,
                category: 'Stationery',
                image: '📓',
                stock: 43,
                rating: 4.95,
                sales: 234,
                description: 'Luxury leather diary for journaling and planning'
            },
            {
                id: 3,
                name: 'Math & Logic Worksheets (Grade 5)',
                price: 249,
                sellerId: 3,
                category: 'Worksheets',
                image: '📐',
                stock: 89,
                rating: 4.8,
                sales: 456,
                description: 'Comprehensive math worksheets for critical thinking'
            },
            {
                id: 4,
                name: 'Ashwagandha Root Powder 250g',
                price: 499,
                sellerId: 1,
                category: 'Natural Products',
                image: '🌿',
                stock: 76,
                rating: 4.85,
                sales: 345,
                description: 'Premium Ashwagandha for wellness'
            },
            {
                id: 5,
                name: 'Custom Monogram Notebook Set',
                price: 899,
                sellerId: 2,
                category: 'Stationery',
                image: '📔',
                stock: 21,
                rating: 4.9,
                sales: 167,
                description: 'Personalized notebook set with monogram'
            },
            {
                id: 6,
                name: 'Science Experiment Worksheets Bundle',
                price: 599,
                sellerId: 3,
                category: 'Worksheets',
                image: '🔬',
                stock: 45,
                rating: 4.7,
                sales: 234,
                description: 'Interactive science worksheets for hands-on learning'
            }
        ];
        
        this.state.filteredProducts = [...this.state.products];
        this.notify();
    }
    
    // ========== State Management ==========
    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.saveToStorage();
        this.notify();
    }
    
    updateCart(cart) {
        this.state.cart = cart;
        this.saveToStorage();
        this.notify();
    }
    
    subscribe(callback) {
        this.listeners.push(callback);
    }
    
    notify() {
        this.listeners.forEach(cb => cb(this.state));
    }
    
    // ========== Cart Operations ==========
    addToCart(productId) {
        const product = this.state.products.find(p => p.id === productId);
        if (!product) return;
        
        const existing = this.state.cart.find(item => item.id === productId);
        
        if (existing) {
            existing.quantity += 1;
        } else {
            this.state.cart.push({
                ...product,
                quantity: 1
            });
        }
        
        this.updateCart(this.state.cart);
        this.showToast('✅ Added to cart!', 'success');
    }
    
    removeFromCart(productId) {
        this.state.cart = this.state.cart.filter(item => item.id !== productId);
        this.updateCart(this.state.cart);
    }
    
    updateQuantity(productId, change) {
        const item = this.state.cart.find(item => item.id === productId);
        if (!item) return;
        
        item.quantity += change;
        
        if (item.quantity <= 0) {
            this.removeFromCart(productId);
        } else {
            this.updateCart(this.state.cart);
        }
    }
    
    clearCart() {
        this.state.cart = [];
        this.updateCart([]);
    }
    
    // ========== Product Filtering ==========
    filterProducts() {
        let filtered = [...this.state.products];
        
        // Category filter
        if (this.state.filters.category !== 'all') {
            filtered = filtered.filter(p => p.category === this.state.filters.category);
        }
        
        // Search filter
        if (this.state.filters.search) {
            const search = this.state.filters.search.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(search) ||
                p.description.toLowerCase().includes(search)
            );
        }
        
        // Sort
        switch (this.state.filters.sortBy) {
            case 'price-low':
                filtered.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                filtered.sort((a, b) => b.price - a.price);
                break;
            case 'rating':
                filtered.sort((a, b) => b.rating - a.rating);
                break;
            case 'newest':
                filtered.sort((a, b) => b.id - a.id);
                break;
            default: // relevance
                filtered.sort((a, b) => b.sales - a.sales);
        }
        
        this.state.filteredProducts = filtered;
        this.notify();
    }
    
    setFilter(filterName, value) {
        this.state.filters[filterName] = value;
        this.filterProducts();
    }
    
    // ========== Modal Management ==========
    openModal(modalName) {
        this.state.modals[modalName] = true;
        this.notify();
    }
    
    closeModal(modalName) {
        this.state.modals[modalName] = false;
        this.notify();
    }
    
    // ========== Calculations ==========
    getCartTotal() {
        return this.state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    
    getCartCount() {
        return this.state.cart.reduce((sum, item) => sum + item.quantity, 0);
    }
    
    getShipping() {
        return this.state.cart.length > 0 ? 50 : 0;
    }
    
    getDiscount() {
        const total = this.getCartTotal();
        return total > 1000 ? Math.floor(total * 0.05) : 0;
    }
    
    getFinalTotal() {
        return this.getCartTotal() + this.getShipping() - this.getDiscount();
    }
    
    getSeller(sellerId) {
        return this.state.sellers.find(s => s.id === sellerId);
    }

    // ========== Product Detail ==========
    async setSelectedProductById(productId) {
        let product = this.state.products.find(p => p.id === productId);

        // If not in current list (or missing fields), try fetching from API
        if (!product && window.api && typeof window.api.getProduct === 'function') {
            try {
                const result = await window.api.getProduct(productId);
                product = result.data;
            } catch (error) {
                console.error('❌ Load product detail error:', error);
                this.showToast('Unable to load product details', 'error');
            }
        }

        if (product) {
            this.state.selectedProduct = product;
            this.notify();
        }
    }

    clearSelectedProduct() {
        this.state.selectedProduct = null;
        this.notify();
    }
    
    // ========== Auth (OTP + SAFE KEY) ==========
    /**
     * Start login/signup by requesting an OTP to email or phone.
     */
    async startOtpFlow(identifier, purpose = 'login') {
        if (!identifier) {
            throw new Error('Identifier is required');
        }

        const api = window.api;
        if (!api || typeof api.requestOtp !== 'function') {
            throw new Error('Auth service not available');
        }

        this.state.auth.identifier = identifier;
        this.state.auth.otpStage = 'requesting';
        this.notify();

        const result = await api.requestOtp(identifier, purpose);

        this.state.auth.otpRequestId = result.requestId;
        this.state.auth.otpStage = 'awaiting_otp';
        this.notify();

        this.showToast('📩 OTP sent. Please check your phone/email.', 'info');
        return result;
    }

    /**
     * Verify OTP code.
     * Backend should tell us whether this is a first-time user (needs key)
     * or an existing user (already has key set).
     */
    async verifyOtpCode(otpCode) {
        const api = window.api;
        if (!api || typeof api.verifyOtp !== 'function') {
            throw new Error('Auth service not available');
        }

        if (!this.state.auth.otpRequestId) {
            throw new Error('No OTP request in progress');
        }

        const result = await api.verifyOtp(this.state.auth.otpRequestId, otpCode);

        // Expect backend to return { user, hasKey, token? }
        const user = result.user || null;
        const hasKey = !!result.hasKey;

        this.state.user = user;
        this.state.isLoggedIn = !!user && hasKey && !!result.token;

        if (!hasKey) {
            // First-time user – ask them to set a key
            this.state.auth.otpStage = 'set_key';
            this.showToast('Create your private key to secure your account.', 'info');
        } else if (!this.state.isLoggedIn) {
            // Has key but not logged in yet (token will be obtained via loginWithKey)
            this.state.auth.otpStage = 'login_with_key';
        } else {
            // Fully logged in
            this.state.auth.otpStage = 'idle';
            this.closeModal('login');
            this.showToast('✅ Logged in successfully!', 'success');
        }

        this.saveToStorage();
        this.notify();
        return result;
    }

    /**
     * First-time key setup after OTP verification.
     */
    async setSafeKey(key) {
        const api = window.api;
        if (!api || typeof api.setSafeKey !== 'function') {
            throw new Error('Auth service not available');
        }

        const result = await api.setSafeKey(key);

        // Expect backend to return { user, token }
        if (result.user) {
            this.state.user = result.user;
        }
        this.state.isLoggedIn = !!this.state.user;
        // 15-minute session window from now
        this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;

        // Preload profile & orders for account view
        this.loadProfileAndOrders().catch(console.error);

        this.state.auth.otpStage = 'idle';
        this.saveToStorage();
        this.notify();

        this.closeModal('login');
        this.showToast('🔐 Key set. You are now logged in.', 'success');

        return result;
    }

    /**
     * Existing user login using identifier + key.
     */
    async loginWithKey(identifier, key) {
        const api = window.api;
        if (!api || typeof api.loginWithKey !== 'function') {
            throw new Error('Auth service not available');
        }

        const result = await api.loginWithKey(identifier, key);

        this.state.user = result.user || null;
        this.state.isLoggedIn = !!this.state.user;
        this.state.auth.otpStage = 'idle';
        this.state.auth.identifier = identifier;
        this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;

        // Preload profile & orders for account view
        this.loadProfileAndOrders().catch(console.error);

        this.saveToStorage();
        this.notify();

        this.closeModal('login');
        this.showToast('✅ Logged in successfully!', 'success');

        return result;
    }

    // ========== Account Data (Profile, Orders, Seller Dashboard) ==========

    async loadProfile() {
        if (!this.state.isLoggedIn) return;
        const api = window.api;
        if (!api || typeof api.getProfile !== 'function') return;

        this.state.account.loading.profile = true;
        this.notify();

        try {
            const result = await api.getProfile();
            this.state.account.profile = result.data;
            // Keep top-level user in sync
            this.state.user = result.data;
            this.saveToStorage();
        } catch (error) {
            console.error('❌ Load profile error:', error);
            this.showToast('Unable to load profile', 'error');
        } finally {
            this.state.account.loading.profile = false;
            this.notify();
        }
    }

    async loadOrders() {
        if (!this.state.isLoggedIn) return;
        const api = window.api;
        if (!api || typeof api.getOrders !== 'function') return;

        this.state.account.loading.orders = true;
        this.notify();

        try {
            const result = await api.getOrders();
            this.state.account.orders = result.data || [];
        } catch (error) {
            console.error('❌ Load orders error:', error);
            this.showToast('Unable to load orders', 'error');
        } finally {
            this.state.account.loading.orders = false;
            this.notify();
        }
    }

    async loadSellerDashboard() {
        if (!this.state.isLoggedIn) return;
        const api = window.api;
        if (!api || typeof api.getSellerProducts !== 'function') return;

        // Only if user is a seller
        const sellerId = this.state.user?.role === 'seller' ? this.state.user._id || this.state.user.id : null;
        if (!sellerId) return;

        this.state.account.loading.seller = true;
        this.notify();

        try {
            const result = await api.getSellerProducts(sellerId);
            this.state.account.sellerProducts = result.data || [];
        } catch (error) {
            console.error('❌ Load seller products error:', error);
            this.showToast('Unable to load seller products', 'error');
        } finally {
            this.state.account.loading.seller = false;
            this.notify();
        }
    }

    async loadProfileAndOrders() {
        await Promise.all([this.loadProfile(), this.loadOrders()]);
    }

    setAccountView(view) {
        this.state.account.view = view;
        this.notify();

        if (view === 'orders') {
            this.loadOrders().catch(console.error);
        } else if (view === 'seller') {
            this.loadSellerDashboard().catch(console.error);
        } else if (view === 'admin') {
            this.loadAdminDashboard().catch(console.error);
        }
    }

    async loadAdminDashboard() {
        if (!this.state.isLoggedIn || this.state.user?.role !== 'admin') return;
        const api = window.api;
        if (!api || typeof api.getAdminDashboard !== 'function' || typeof api.getPendingSellers !== 'function') return;

        this.state.account.loading.admin = true;
        this.notify();

        try {
            const [dashboard, pending] = await Promise.all([
                api.getAdminDashboard(),
                api.getPendingSellers()
            ]);
            this.state.account.adminDashboard = dashboard.data;
            this.state.account.pendingSellers = pending.data || [];
        } catch (error) {
            console.error('❌ Load admin dashboard error:', error);
            this.showToast('Unable to load admin dashboard', 'error');
        } finally {
            this.state.account.loading.admin = false;
            this.notify();
        }
    }

    /**
     * Extend the current session if token is still valid.
     */
    async extendSession() {
        const api = window.api;
        if (!api || typeof api.refreshToken !== 'function') {
            throw new Error('Auth service not available');
        }

        const result = await api.refreshToken();

        // Reset expiry window
        this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;

        this.saveToStorage();
        this.notify();

        this.showToast('⏱ Session extended by 15 minutes.', 'success');

        return result;
    }

    /**
     * Check for session expiry and trigger warnings/auto logout.
     * Intended to be called on an interval from the shell.
     */
    checkSessionExpiry() {
        if (!this.state.isLoggedIn || !this.state.sessionExpiresAt) return;

        const remaining = this.state.sessionExpiresAt - Date.now();

        if (remaining <= 0) {
            // Session expired
            this.logout();
            this.showToast('🔒 Session expired. Please login again.', 'info');
            return;
        }

        const threeMinutes = 3 * 60 * 1000;
        if (remaining <= threeMinutes && !this.state.auth.sessionWarningShown) {
            this.state.auth.sessionWarningShown = true;
            this.state.auth.showSessionExtend = true;
            this.notify();
        }
    }

    logout() {
        this.state.user = null;
        this.state.isLoggedIn = false;
        this.state.sessionExpiresAt = null;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;
        localStorage.removeItem('emproium_user');
        if (window.api && typeof window.api.logout === 'function') {
            window.api.logout();
        }
        this.notify();
        this.showToast('👋 Logged out', 'info');
    }
    
    // ========== Orders ==========
    async placeOrder(orderData) {
        this.state.loading.order = true;
        this.notify();
        
        try {
            // Send to EmailJS
            const result = await EmailManager.submitOrderToGmail({
                customerName: orderData.name,
                customerEmail: orderData.email,
                customerPhone: orderData.phone,
                customerAddress: orderData.address,
                items: EmailManager.generateOrderSummary(this.state.cart),
                subtotal: this.getCartTotal(),
                shipping: this.getShipping(),
                discount: this.getDiscount(),
                total: this.getFinalTotal(),
                paymentMethod: orderData.paymentMethod,
                notes: orderData.notes
            });
            
            // Save last order
            this.state.lastOrder = {
                orderId: result.orderId,
                orderData,
                timestamp: new Date(),
                total: this.getFinalTotal()
            };
            
            this.state.loading.order = false;
            this.clearCart();
            this.closeModal('checkout');
            this.notify();
            
            this.showToast('✅ Order placed successfully!', 'success');
            return result;
            
        } catch (error) {
            this.state.loading.order = false;
            this.notify();
            this.showToast('❌ ' + error.message, 'error');
            throw error;
        }
    }
    
    // ========== Seller Registration ==========
    async registerSeller(formData) {
        this.state.loading.checkout = true;
        this.notify();
        
        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const newSeller = {
                id: this.state.sellers.length + 1,
                name: formData.businessName,
                desc: formData.description,
                status: 'pending',
                verified: false,
                avatar: '🏪'
            };
            
            this.state.sellers.push(newSeller);
            this.state.loading.checkout = false;
            this.closeModal('seller');
            this.notify();
            
            this.showToast('✅ Application submitted! Admin will review within 24 hours.', 'success');
            return newSeller;
            
        } catch (error) {
            this.state.loading.checkout = false;
            this.notify();
            this.showToast('❌ Registration failed', 'error');
            throw error;
        }
    }
    
    // ========== Notifications ==========
    showToast(message, type = 'info') {
        const toast = {
            id: Date.now(),
            message,
            type,
            visible: true
        };
        
        // Auto-hide after 4 seconds
        setTimeout(() => {
            const el = document.querySelector(`[data-toast="${toast.id}"]`);
            if (el) el.remove();
        }, 4000);
        
        return toast;
    }
    
    // ========== Mobile Menu ==========
    toggleMobileMenu() {
        this.state.mobileMenuOpen = !this.state.mobileMenuOpen;
        this.notify();
    }
    
    closeMobileMenu() {
        this.state.mobileMenuOpen = false;
        this.notify();
    }
}

// ============================================
// 2. INITIALIZE GLOBAL STORE
// ============================================
const store = new AppStore();

// ============================================
// 3. ALPINE.JS APP INITIALIZATION
// ============================================
function appData() {
    return {
        // Expose store state
        store: store.state,
        api: window.api,
        
        // Cart methods
        addToCart(productId) {
            store.addToCart(productId);
        },
        
        removeFromCart(productId) {
            store.removeFromCart(productId);
        },
        
        updateQuantity(productId, change) {
            store.updateQuantity(productId, change);
        },
        
        clearCart() {
            store.clearCart();
        },
        
        // Filter methods
        setCategory(category) {
            store.setFilter('category', category);
        },
        
        setSort(sortBy) {
            store.setFilter('sortBy', sortBy);
        },
        
        search(term) {
            store.setFilter('search', term);
        },
        
        // Modal methods
        openCart() {
            store.openModal('cart');
        },
        
        closeCart() {
            store.closeModal('cart');
        },
        
        openSellerModal() {
            store.openModal('seller');
        },
        
        closeSellerModal() {
            store.closeModal('seller');
        },
        
        openLoginModal() {
            store.openModal('login');
        },
        
        closeLoginModal() {
            store.closeModal('login');
        },
        
        openCheckoutModal() {
            store.openModal('checkout');
        },
        
        closeCheckoutModal() {
            store.closeModal('checkout');
        },
        
        // Calculations
        getCartTotal() {
            return store.getCartTotal();
        },
        
        getCartCount() {
            return store.getCartCount();
        },
        
        getShipping() {
            return store.getShipping();
        },
        
        getDiscount() {
            return store.getDiscount();
        },
        
        getFinalTotal() {
            return store.getFinalTotal();
        },
        
        getSeller(sellerId) {
            return store.getSeller(sellerId);
        },

        // Product detail
        async openProduct(productId) {
            await store.setSelectedProductById(productId);
            this.scrollTo('product-detail');
        },

        closeProductDetail() {
            store.clearSelectedProduct();
        },
        
        // Order methods
        async placeOrder(formData) {
            await store.placeOrder(formData);
        },
        
        // Auth methods (OTP + key)
        async startOtp(identifier, purpose = 'login') {
            return store.startOtpFlow(identifier, purpose);
        },

        async verifyOtp(otpCode) {
            return store.verifyOtpCode(otpCode);
        },

        async setSafeKey(key) {
            return store.setSafeKey(key);
        },

        async loginWithKey(identifier, key) {
            return store.loginWithKey(identifier, key);
        },

        async extendSession() {
            return store.extendSession();
        },

        // Account views
        setAccountView(view) {
            store.setAccountView(view);
        },

        async loadProfile() {
            await store.loadProfile();
        },

        async loadOrders() {
            await store.loadOrders();
        },

        async loadSellerDashboard() {
            await store.loadSellerDashboard();
        },

        async loadAdminDashboard() {
            await store.loadAdminDashboard();
        },

        logout() {
            store.logout();
        },
        
        // Seller registration
        async registerSeller(formData) {
            await store.registerSeller(formData);
        },
        
        // Mobile menu
        toggleMobileMenu() {
            store.toggleMobileMenu();
        },
        
        closeMobileMenu() {
            store.closeMobileMenu();
        },
        
        // Scroll utilities
        scrollTo(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        
        // Format currency
        formatPrice(price) {
            return '₹' + price.toLocaleString('en-IN');
        },
        
        // Format number
        formatNumber(num) {
            return num.toLocaleString('en-IN');
        },
        
        // Subscribe to store updates
        init() {
            store.subscribe((newState) => {
                this.$data.store = newState;
            });
        }
    };
}

// ============================================
// 4. DOCUMENT READY - Initialize App
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Alpine if not already done
    if (window.Alpine && !window.appInitialized) {
        console.log('✅ EmproiumVipani App Initialized');
        console.log('🛒 Products:', store.state.products.length);
        console.log('👥 Sellers:', store.state.sellers.length);
        console.log('📧 EmailJS Configured:', !!window.EmailManager);
        window.appInitialized = true;
    }

    // Start periodic session expiry checks (every 30 seconds)
    setInterval(() => {
        if (typeof store.checkSessionExpiry === 'function') {
            store.checkSessionExpiry();
        }
    }, 30000);
});

// ============================================
// 5. SERVICE WORKER REGISTRATION (PWA)
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('⚠️ Service Worker error:', err));
    });
}

// ============================================
// 6. EXPORT FOR GLOBAL ACCESS
// ============================================
window.AppStore = AppStore;
window.store = store;
window.appData = appData;

console.log('🚀 App.js loaded successfully');
