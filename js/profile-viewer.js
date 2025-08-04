/**
 * Profile Viewer for displaying individual user profiles and their posts
 */

class ProfileViewer {
    constructor() {
        this.relayManager = new RelayManager();
        this.elements = this.initializeElements();
        this.userPubkey = null;
        this.profileData = null;
        this.userPosts = [];
        this.reactions = new Map(); // eventId -> reactions
        this.reactionsLoading = new Set(); // track which posts are loading reactions
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        return {
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            profileSection: document.getElementById('profileSection'),
            profileAvatar: document.getElementById('profileAvatar'),
            profileName: document.getElementById('profileName'),
            profilePubkey: document.getElementById('profilePubkey'),
            profileBio: document.getElementById('profileBio'),
            postsCount: document.getElementById('postsCount'),
            followingCount: document.getElementById('followingCount'),
            followersCount: document.getElementById('followersCount'),
            profileDetails: document.getElementById('profileDetails'),
            websiteDetail: document.getElementById('websiteDetail'),
            profileWebsite: document.getElementById('profileWebsite'),
            lightningDetail: document.getElementById('lightningDetail'),
            profileLightning: document.getElementById('profileLightning'),
            joinedDetail: document.getElementById('joinedDetail'),
            profileJoined: document.getElementById('profileJoined'),
            postsSection: document.getElementById('postsSection'),
            postsList: document.getElementById('postsList'),
            noPostsMessage: document.getElementById('noPostsMessage')
        };
    }

    /**
     * Load profile for a user
     */
    async loadProfile(pubkey) {
        try {
            this.userPubkey = CryptoUtils.normalizeKey(pubkey);
            console.log('Loading profile for:', this.userPubkey);
        } catch (e) {
            this.showError('Invalid public key format: ' + e.message);
            return;
        }

        // Reset state
        this.profileData = null;
        this.userPosts = [];
        this.reactions.clear();
        this.reactionsLoading.clear();
        
        // Show loading
        this.showLoading();

        try {
            // Connect to relays
            await this.relayManager.connectToRelays();

            // Load profile data, posts, and following list
            await Promise.all([
                this.loadProfileData(),
                this.loadUserPosts(),
                this.loadFollowingCount()
            ]);

            // Set timeout to finish loading
            setTimeout(() => {
                this.hideLoading();
                if (!this.profileData) {
                    this.showError('Profile not found for this user. They may not have set up a profile, or their data may not be available on these relays.');
                } else {
                    this.displayProfile();
                    this.displayPosts();
                }
            }, 3000);

        } catch (error) {
            console.error('Error loading profile:', error);
            this.showError('Failed to load profile: ' + error.message);
        }
    }

    /**
     * Load profile data (Kind 0)
     */
    async loadProfileData() {
        return new Promise((resolve) => {
            const profileFilter = {
                kinds: [0],
                authors: [this.userPubkey],
                limit: 1
            };

            this.relayManager.subscribe('profile', profileFilter, (profileEvent, relayUrl) => {
                console.log(`Found profile from ${relayUrl}:`, profileEvent);
                
                try {
                    const profile = JSON.parse(profileEvent.content);
                    if (!this.profileData || profileEvent.created_at > this.profileData.created_at) {
                        this.profileData = {
                            ...profile,
                            pubkey: profileEvent.pubkey,
                            created_at: profileEvent.created_at
                        };
                        this.displayProfile();
                    }
                } catch (e) {
                    console.error('Error parsing profile:', e);
                }
            });

            setTimeout(resolve, 2000);
        });
    }

    /**
     * Load user posts (Kind 1)
     */
    async loadUserPosts() {
        return new Promise((resolve) => {
            const postsFilter = {
                kinds: [1],
                authors: [this.userPubkey],
                limit: 50
            };

            this.relayManager.subscribe('user_posts', postsFilter, (postEvent, relayUrl) => {
                console.log(`Found post from ${relayUrl}:`, postEvent.id.slice(0, 8));
                
                // Check for duplicates
                const existingPost = this.userPosts.find(p => p.id === postEvent.id);
                if (!existingPost) {
                    this.userPosts.push(postEvent);
                    this.displayPosts();
                    
                    // Reaction loading is now handled by displayPosts()
                }
            });

            setTimeout(resolve, 2000);
        });
    }

    /**
     * Load following count (Kind 3)
     */
    async loadFollowingCount() {
        return new Promise((resolve) => {
            const followingFilter = {
                kinds: [3],
                authors: [this.userPubkey],
                limit: 1
            };

            this.relayManager.subscribe('following', followingFilter, (followingEvent, relayUrl) => {
                console.log(`Found following list from ${relayUrl}`);
                
                if (followingEvent.tags) {
                    const followingCount = followingEvent.tags.filter(tag => tag[0] === 'p').length;
                    this.elements.followingCount.textContent = followingCount;
                }
            });

            setTimeout(resolve, 1000);
        });
    }

    /**
     * Load reactions for a specific post
     */
    loadPostReactions(eventId) {
        console.log(`[Profile] Starting to load reactions for post: ${eventId.slice(0, 8)}`);
        
        const reactionsFilter = {
            kinds: [7],
            '#e': [eventId],
            limit: 100
        };

        const subscriptionId = `reactions_${eventId.slice(0, 8)}`;
        
        this.relayManager.subscribe(subscriptionId, reactionsFilter, (reactionEvent, relayUrl) => {
            console.log(`[Profile] Found reaction for ${eventId.slice(0, 8)} from ${relayUrl}:`, reactionEvent);
            
            if (!this.reactions.has(eventId)) {
                this.reactions.set(eventId, []);
            }
            
            // Check for duplicate reactions
            const existingReaction = this.reactions.get(eventId).find(r => r.id === reactionEvent.id);
            if (!existingReaction) {
                this.reactions.get(eventId).push(reactionEvent);
                console.log(`[Profile] Added reaction, total for this post: ${this.reactions.get(eventId).length}`);
                this.updatePostReactions(eventId);
            }
        });

        // Set a fallback timeout to show "No reactions yet" if none are found
        setTimeout(() => {
            const reactions = this.reactions.get(eventId) || [];
            if (reactions.length === 0) {
                console.log(`[Profile] No reactions found after timeout for post: ${eventId.slice(0, 8)}`);
                this.updatePostReactions(eventId);
            }
        }, 3000);

        // Clean up subscription after a delay
        setTimeout(() => {
            this.relayManager.unsubscribe(subscriptionId);
            console.log(`[Profile] Cleaned up reactions subscription for ${eventId.slice(0, 8)}`);
        }, 8000);
    }

    /**
     * Display profile information
     */
    displayProfile() {
        if (!this.profileData) return;

        this.elements.profileSection.style.display = 'block';
        
        // Avatar
        if (this.profileData.picture) {
            const img = document.createElement('img');
            img.src = this.profileData.picture;
            img.onerror = () => {
                this.elements.profileAvatar.className = 'profile-avatar no-image';
                this.elements.profileAvatar.textContent = (this.profileData.name || 'User').slice(0, 2).toUpperCase();
            };
            this.elements.profileAvatar.innerHTML = '';
            this.elements.profileAvatar.appendChild(img);
            this.elements.profileAvatar.className = 'profile-avatar';
        } else {
            this.elements.profileAvatar.className = 'profile-avatar no-image';
            this.elements.profileAvatar.textContent = (this.profileData.name || 'User').slice(0, 2).toUpperCase();
        }

        // Basic info
        this.elements.profileName.textContent = this.profileData.name || this.profileData.display_name || 'Anonymous User';
        this.elements.profilePubkey.textContent = this.userPubkey;
        this.elements.profileBio.textContent = this.profileData.about || 'No bio available';

        // Details
        let hasDetails = false;
        
        if (this.profileData.website) {
            this.elements.profileWebsite.href = this.profileData.website;
            this.elements.profileWebsite.textContent = this.profileData.website;
            this.elements.websiteDetail.style.display = 'flex';
            hasDetails = true;
        }

        if (this.profileData.lud16 || this.profileData.lud06) {
            this.elements.profileLightning.textContent = this.profileData.lud16 || this.profileData.lud06;
            this.elements.lightningDetail.style.display = 'flex';
            hasDetails = true;
        }

        // Join date (from profile creation)
        this.elements.profileJoined.textContent = new Date(this.profileData.created_at * 1000).toLocaleDateString();
        hasDetails = true;

        if (hasDetails) {
            this.elements.profileDetails.style.display = 'block';
        }

        // Update page title
        document.title = `${this.profileData.name || 'User'} - Nostr Profile`;
    }

    /**
     * Display user posts
     */
    displayPosts() {
        this.elements.postsSection.style.display = 'block';
        this.elements.postsCount.textContent = this.userPosts.length;

        if (this.userPosts.length === 0) {
            this.elements.noPostsMessage.style.display = 'block';
            return;
        }

        // Sort posts by timestamp (newest first)
        const sortedPosts = [...this.userPosts].sort((a, b) => b.created_at - a.created_at);

        // Clear existing posts
        this.elements.postsList.innerHTML = '';
        this.elements.noPostsMessage.style.display = 'none';

        // Render each post
        sortedPosts.forEach(post => {
            const postElement = ContentRenderer.createPostElement(post, {
                fetchEvent: (eventId, callback) => {
                    this.relayManager.fetchEvent(eventId, callback);
                }
            });

            // ContentRenderer already creates the reactions div, so we don't need to create another one
            this.elements.postsList.appendChild(postElement);
            
            // Load reactions for this post after it's added to DOM (if not already loading)
            if (!this.reactionsLoading.has(post.id)) {
                setTimeout(() => {
                    this.loadPostReactions(post.id);
                }, 100);
            }
        });
    }

    /**
     * Update reactions display for a specific post
     */
    updatePostReactions(eventId) {
        console.log(`[Profile] Updating reactions display for post: ${eventId.slice(0, 8)}`);
        
        const reactionsContainer = document.getElementById(`reactions-${eventId}`);
        if (!reactionsContainer) {
            console.log(`[Profile] No reactions container found for post: ${eventId.slice(0, 8)}, retrying in 200ms`);
            // Retry after a short delay in case the DOM isn't ready yet
            setTimeout(() => {
                const retryContainer = document.getElementById(`reactions-${eventId}`);
                if (retryContainer) {
                    console.log(`[Profile] Found reactions container on retry for post: ${eventId.slice(0, 8)}`);
                    this._doUpdatePostReactions(eventId, retryContainer);
                } else {
                    console.log(`[Profile] Still no reactions container found for post: ${eventId.slice(0, 8)} after retry`);
                }
            }, 200);
            return;
        }

        this._doUpdatePostReactions(eventId, reactionsContainer);
    }

    /**
     * Internal method to actually update reactions display
     */
    _doUpdatePostReactions(eventId, reactionsContainer) {
        const reactions = this.reactions.get(eventId) || [];
        console.log(`[Profile] Found ${reactions.length} reactions for post: ${eventId.slice(0, 8)}`);
        
        if (reactions.length === 0) {
            reactionsContainer.innerHTML = '<span class="reactions-loading">No reactions yet</span>';
            return;
        }

        // Group reactions by content (emoji)
        const reactionGroups = {};
        reactions.forEach(reaction => {
            const emoji = reaction.content || '👍';
            console.log(`[Profile] Processing reaction with emoji: ${emoji}`);
            if (!reactionGroups[emoji]) {
                reactionGroups[emoji] = [];
            }
            reactionGroups[emoji].push(reaction);
        });

        // Clear loading message
        reactionsContainer.innerHTML = '';

        // Display each reaction group
        Object.entries(reactionGroups).forEach(([emoji, reactionList]) => {
            console.log(`[Profile] Creating reaction display for ${emoji}: ${reactionList.length} reactions`);
            
            const reactionElement = document.createElement('div');
            reactionElement.className = 'reaction';
            reactionElement.title = `${reactionList.length} ${emoji} reaction${reactionList.length > 1 ? 's' : ''}`;

            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'reaction-emoji';
            emojiSpan.textContent = emoji;

            const countSpan = document.createElement('span');
            countSpan.className = 'reaction-count';
            countSpan.textContent = reactionList.length;

            reactionElement.appendChild(emojiSpan);
            reactionElement.appendChild(countSpan);
            reactionsContainer.appendChild(reactionElement);
        });
        
        console.log(`[Profile] Updated reactions display completed for post: ${eventId.slice(0, 8)}`);
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.elements.loading.style.display = 'block';
        this.elements.error.style.display = 'none';
        this.elements.profileSection.style.display = 'none';
        this.elements.postsSection.style.display = 'none';
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        this.elements.loading.style.display = 'none';
    }

    /**
     * Show error message
     */
    showError(message) {
        this.elements.error.textContent = message;
        this.elements.error.style.display = 'block';
        this.hideLoading();
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.relayManager.closeAllConnections();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pubkey = urlParams.get('pubkey');
    
    if (pubkey) {
        window.profileViewer = new ProfileViewer();
        window.profileViewer.loadProfile(pubkey);
    } else {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').textContent = 'No public key provided in URL. Use ?pubkey=<key> to view a profile.';
        document.getElementById('error').style.display = 'block';
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.profileViewer) {
        window.profileViewer.destroy();
    }
});