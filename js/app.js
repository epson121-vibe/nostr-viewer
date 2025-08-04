/**
 * Main Nostr Profile Viewer Application
 */

class NostrApp {
    constructor() {
        this.relayManager = new RelayManager();
        this.uiManager = new UIManager();
        this.profileData = null;
        this.postsData = [];
        
        this.initializeApp();
    }

    /**
     * Initialize the application
     */
    initializeApp() {
        // Setup UI event listeners
        this.uiManager.setupEventListeners({
            onSubmit: () => this.fetchProfile()
        });

        // Make fetchProfile available globally for the button onclick
        window.fetchProfile = () => this.fetchProfile();
        
        console.log('Nostr Profile Viewer initialized');
    }

    /**
     * Handle test conversion functionality
     */
    handleTestConversion() {
        const testHex = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';
        const testNpub = CryptoUtils.hexToNpub(testHex);
        console.log('Test hex to npub:', testNpub);
        
        const backToHex = CryptoUtils.npubToHex(testNpub);
        console.log('Back to hex:', backToHex);
        
        this.uiManager.showError(`Test conversion: ${testNpub} -> ${backToHex}`);
    }

    /**
     * Main function to fetch and display profile
     */
    async fetchProfile() {
        const pubkeyInput = this.uiManager.getUserInput();
        
        if (!pubkeyInput) {
            this.uiManager.showError('Please enter a public key');
            return;
        }

        // Handle test conversion
        if (pubkeyInput === 'test') {
            this.handleTestConversion();
            return;
        }

        // Validate and normalize the public key
        let pubkey;
        try {
            console.log('Input:', pubkeyInput);
            pubkey = CryptoUtils.normalizeKey(pubkeyInput);
            console.log('Converted pubkey:', pubkey);
            console.log('Pubkey length:', pubkey.length);
            console.log('Input was npub?', pubkeyInput.startsWith('npub'));
        } catch (e) {
            console.error('Decoding error:', e);
            this.uiManager.showError('Error decoding public key: ' + e.message);
            return;
        }

        if (!CryptoUtils.validatePubkey(pubkey)) {
            this.uiManager.showError(`Invalid public key format. Got: ${pubkey} (length: ${pubkey.length})`);
            return;
        }

        // Reset state
        this.relayManager.closeAllConnections();
        this.profileData = null;
        this.postsData = [];
        
        // Show loading state
        this.uiManager.showLoading();

        try {
            // Connect to relays
            const connections = await this.relayManager.connectToRelays();
            console.log('Connection results:', connections);

            // Setup event handlers
            this.setupEventHandlers(pubkey);

            // Subscribe to profile and posts
            this.relayManager.subscribeToProfile(pubkey, (eventData, relayUrl) => {
                this.handleProfileEvent(eventData, relayUrl);
            });

            this.relayManager.subscribeToPosts(pubkey, (eventData, relayUrl) => {
                this.handlePostEvent(eventData, relayUrl);
            });

            // Set timeout for no results
            setTimeout(() => {
                this.uiManager.hideLoading();
                if (!this.profileData) {
                    this.uiManager.showError('No profile found for this public key. The user may not have set up a profile, or the relays may not have their data.');
                }
            }, 3000);

        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showError('Error connecting to relays: ' + error.message);
        }
    }

    /**
     * Setup event handlers for the current session
     */
    setupEventHandlers(pubkey) {
        // We could add more sophisticated event handling here
        // For now, the handlers are set up in the subscribe methods
    }

    /**
     * Handle profile events (Kind 0)
     */
    handleProfileEvent(eventData, relayUrl) {
        if (eventData.kind !== 0) return;

        console.log(`✓ Found profile data from ${relayUrl}!`);
        
        try {
            const profile = JSON.parse(eventData.content);
            
            // Keep the most recent profile data
            if (!this.profileData || eventData.created_at > this.profileData.created_at) {
                this.profileData = {
                    ...profile,
                    pubkey: eventData.pubkey,
                    created_at: eventData.created_at
                };
                
                // Update UI
                this.uiManager.displayProfile(
                    this.profileData, 
                    this.relayManager.getConnectedCount()
                );
            }
        } catch (e) {
            console.error('Error parsing profile content:', e);
        }
    }

    /**
     * Handle post events (Kind 1)
     */
    handlePostEvent(eventData, relayUrl) {
        if (eventData.kind !== 1) return;

        console.log(`✓ Found post from ${relayUrl}!`);
        
        // Avoid duplicates
        const existingPost = this.postsData.find(p => p.id === eventData.id);
        if (!existingPost) {
            this.postsData.push(eventData);
            
            // Update UI with event fetcher
            this.uiManager.displayPosts(this.postsData, {
                fetchEvent: (eventId, callback) => {
                    this.relayManager.fetchEvent(eventId, callback);
                }
            });
        }
    }

    /**
     * Get current app state
     */
    getState() {
        return {
            profileData: this.profileData,
            postsData: this.postsData,
            connectedRelays: this.relayManager.getConnectedCount()
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.relayManager.closeAllConnections();
        this.profileData = null;
        this.postsData = [];
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.nostrApp = new NostrApp();
});