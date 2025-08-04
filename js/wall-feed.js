/**
 * Wall Feed for displaying timeline of followed users' posts
 */

class WallFeed {
    constructor() {
        this.relayManager = new RelayManager();
        this.elements = this.initializeElements();
        this.userPubkey = null;
        this.following = [];
        this.followingProfiles = new Map(); // Cache profiles
        this.timelinePosts = [];
        this.visiblePostsCount = 0;
        this.postsPerPage = 20;
        this.isInfiniteScrollEnabled = true;
        this.isLoading = false;
        this.reactions = new Map(); // eventId -> reactions
        this.reactionsLoading = new Set(); // track which posts are currently loading reactions
        
        this.initializePagination();
    }

    /**
     * Initialize pagination controls and infinite scroll
     */
    initializePagination() {
        // Handle posts per page change
        this.elements.postsPerPage.addEventListener('change', (e) => {
            this.postsPerPage = parseInt(e.target.value);
            this.visiblePostsCount = 0;
            this.updateTimeline();
        });

        // Handle infinite scroll toggle
        this.elements.infiniteScroll.addEventListener('change', (e) => {
            this.isInfiniteScrollEnabled = e.target.checked;
            if (this.isInfiniteScrollEnabled) {
                this.setupInfiniteScroll();
            } else {
                this.removeInfiniteScroll();
            }
            this.updatePaginationControls();
        });

        // Setup initial infinite scroll
        this.setupInfiniteScroll();
    }

    /**
     * Setup infinite scroll functionality
     */
    setupInfiniteScroll() {
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
        }
        
        this.scrollHandler = () => {
            if (this.isLoading || !this.isInfiniteScrollEnabled) return;
            
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            
            // Load more when 200px from bottom
            if (scrollTop + windowHeight >= documentHeight - 200) {
                this.loadMorePosts();
            }
        };
        
        window.addEventListener('scroll', this.scrollHandler);
    }

    /**
     * Remove infinite scroll
     */
    removeInfiniteScroll() {
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        return {
            userPubkey: document.getElementById('userPubkey'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            stats: document.getElementById('stats'),
            followingCount: document.getElementById('followingCount'),
            postsCount: document.getElementById('postsCount'),
            relaysCount: document.getElementById('relaysCount'),
            timeline: document.getElementById('timeline'),
            timelinePosts: document.getElementById('timelinePosts'),
            noPosts: document.getElementById('noPosts'),
            paginationSettings: document.getElementById('paginationSettings'),
            paginationControls: document.getElementById('paginationControls'),
            postsPerPage: document.getElementById('postsPerPage'),
            infiniteScroll: document.getElementById('infiniteScroll'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            loadAllBtn: document.getElementById('loadAllBtn'),
            visiblePosts: document.getElementById('visiblePosts'),
            totalPosts: document.getElementById('totalPosts')
        };
    }

    /**
     * Load wall for a user
     */
    async loadWall() {
        const pubkeyInput = this.elements.userPubkey.value.trim();
        
        if (!pubkeyInput) {
            this.showError('Please enter a public key');
            return;
        }

        // Validate and normalize the public key
        try {
            this.userPubkey = CryptoUtils.normalizeKey(pubkeyInput);
            console.log('Loading wall for:', this.userPubkey);
        } catch (e) {
            this.showError('Invalid public key format: ' + e.message);
            return;
        }

        // Reset state
        this.following = [];
        this.followingProfiles.clear();
        this.timelinePosts = [];
        this.visiblePostsCount = 0;
        this.reactions.clear();
        this.reactionsLoading.clear();
        
        // Show loading
        this.showLoading();
        this.hideStats();
        this.hideTimeline();

        try {
            // Connect to relays
            await this.relayManager.connectToRelays();
            this.updateStats();

            // First, get the user's following list (Kind 3)
            await this.loadFollowingList();

            // Then load posts from followed users
            if (this.following.length > 0) {
                await this.loadTimelinePosts();
            } else {
                this.showError('This user is not following anyone, or their following list is not available on these relays.');
            }

        } catch (error) {
            console.error('Error loading wall:', error);
            this.showError('Failed to load wall: ' + error.message);
        }
    }

    /**
     * Load the user's following list (Kind 3 events)
     */
    async loadFollowingList() {
        return new Promise((resolve, reject) => {
            const followingFilter = {
                kinds: [3],
                authors: [this.userPubkey],
                limit: 1
            };

            let resolved = false;
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (this.following.length === 0) {
                        reject(new Error('No following list found'));
                    } else {
                        resolve();
                    }
                }
            }, 5000);

            this.relayManager.subscribe('following', followingFilter, (followingEvent, relayUrl) => {
                console.log(`Found following list from ${relayUrl}:`, followingEvent);
                
                // Parse the following list from tags
                if (followingEvent.tags) {
                    const pubkeys = followingEvent.tags
                        .filter(tag => tag[0] === 'p')
                        .map(tag => tag[1])
                        .filter(pubkey => pubkey && pubkey.length === 64);
                    
                    if (pubkeys.length > 0) {
                        this.following = [...new Set([...this.following, ...pubkeys])]; // Remove duplicates
                        console.log(`Now following ${this.following.length} users`);
                        this.updateStats();
                        
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            resolve();
                        }
                    }
                }
            });
        });
    }

    /**
     * Load posts from all followed users
     */
    async loadTimelinePosts() {
        if (this.following.length === 0) return;

        console.log(`Loading posts from ${this.following.length} followed users...`);

        // Subscribe to posts from all followed users
        const timelineFilter = {
            kinds: [1],
            authors: this.following,
            limit: 100
        };

        this.relayManager.subscribe('timeline', timelineFilter, (postEvent, relayUrl) => {
            console.log(`Found post from ${relayUrl}:`, postEvent.id.slice(0, 8));
            
            // Check for duplicates
            const existingPost = this.timelinePosts.find(p => p.id === postEvent.id);
            if (!existingPost) {
                this.timelinePosts.push(postEvent);
                this.updateTimeline();
                this.updateStats();
                
                // Only load reactions for posts that are currently visible in the DOM
                // (handled by updateTimeline now)
            }
        });

        // Also load profiles for the followed users (for display names)
        this.loadFollowedUsersProfiles();

        // Show timeline after a short delay
        setTimeout(() => {
            this.hideLoading();
            this.showTimeline();
            this.elements.paginationSettings.style.display = 'block';
            if (this.timelinePosts.length === 0) {
                this.elements.noPosts.style.display = 'block';
            } else {
                // Start with initial page load
                this.visiblePostsCount = 0;
                this.updateTimeline();
            }
        }, 3000);
    }

    /**
     * Load profiles for followed users to get display names
     */
    async loadFollowedUsersProfiles() {
        // Load profiles in batches to avoid overwhelming relays
        const batchSize = 20;
        const batches = [];
        
        for (let i = 0; i < this.following.length; i += batchSize) {
            batches.push(this.following.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            const profileFilter = {
                kinds: [0],
                authors: batch,
                limit: batch.length
            };

            this.relayManager.subscribe(`profiles_${Date.now()}`, profileFilter, (profileEvent, relayUrl) => {
                try {
                    const profile = JSON.parse(profileEvent.content);
                    this.followingProfiles.set(profileEvent.pubkey, {
                        ...profile,
                        pubkey: profileEvent.pubkey
                    });
                    
                    // Re-render timeline with updated profile info
                    this.updateTimeline();
                } catch (e) {
                    console.error('Error parsing profile:', e);
                }
            });
        }
    }

    /**
     * Get display info for a user
     */
    getUserDisplayInfo(pubkey) {
        const profile = this.followingProfiles.get(pubkey);
        return {
            name: profile?.name || profile?.display_name || `${pubkey.slice(0, 8)}...`,
            avatar: profile?.picture || null,
            pubkey: pubkey
        };
    }

    /**
     * Update the timeline display with pagination
     */
    updateTimeline() {
        if (this.timelinePosts.length === 0) return;

        // Sort posts by timestamp (newest first)
        const sortedPosts = [...this.timelinePosts].sort((a, b) => b.created_at - a.created_at);

        // If this is the first load, reset visible count
        if (this.visiblePostsCount === 0) {
            this.elements.timelinePosts.innerHTML = '';
            this.elements.noPosts.style.display = 'none';
        }

        // Calculate posts to show
        const startIndex = this.visiblePostsCount;
        const endIndex = Math.min(startIndex + this.postsPerPage, sortedPosts.length);
        const postsToShow = sortedPosts.slice(startIndex, endIndex);

        // Render new posts
        postsToShow.forEach(post => {
            const postElement = this.createTimelinePost(post);
            this.elements.timelinePosts.appendChild(postElement);
            
            // Load reactions for this newly rendered post (if not already loading)
            if (!this.reactionsLoading.has(post.id)) {
                setTimeout(() => {
                    this.loadPostReactions(post.id);
                }, 100);
            }
        });

        // Update visible count
        this.visiblePostsCount = endIndex;

        // Update pagination info and controls
        this.updatePaginationInfo();
        this.updatePaginationControls();
    }

    /**
     * Load more posts (for pagination)
     */
    loadMorePosts() {
        if (this.isLoading || this.visiblePostsCount >= this.timelinePosts.length) {
            return;
        }

        this.isLoading = true;
        this.elements.loadMoreBtn.textContent = 'Loading...';
        this.elements.loadMoreBtn.disabled = true;

        // Simulate slight delay for better UX
        setTimeout(() => {
            this.updateTimeline();
            this.isLoading = false;
            this.elements.loadMoreBtn.textContent = 'Load More Posts';
            this.elements.loadMoreBtn.disabled = false;
        }, 300);
    }

    /**
     * Load all remaining posts
     */
    loadAllPosts() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.elements.loadAllBtn.textContent = 'Loading...';
        this.elements.loadAllBtn.disabled = true;

        // Load all remaining posts
        this.visiblePostsCount = 0;
        this.postsPerPage = this.timelinePosts.length;
        
        setTimeout(() => {
            this.updateTimeline();
            this.isLoading = false;
            this.elements.loadAllBtn.textContent = 'Load All Posts';
            this.elements.loadAllBtn.disabled = false;
            this.postsPerPage = parseInt(this.elements.postsPerPage.value); // Reset to original
        }, 500);
    }

    /**
     * Update pagination info display
     */
    updatePaginationInfo() {
        this.elements.visiblePosts.textContent = this.visiblePostsCount;
        this.elements.totalPosts.textContent = this.timelinePosts.length;
    }

    /**
     * Update pagination controls visibility and state
     */
    updatePaginationControls() {
        const hasMorePosts = this.visiblePostsCount < this.timelinePosts.length;
        
        if (this.timelinePosts.length > 0) {
            this.elements.paginationControls.style.display = 'block';
            
            // Show/hide buttons based on infinite scroll setting and remaining posts
            if (this.isInfiniteScrollEnabled) {
                this.elements.loadMoreBtn.style.display = 'none';
                this.elements.loadAllBtn.style.display = hasMorePosts ? 'inline-block' : 'none';
            } else {
                this.elements.loadMoreBtn.style.display = hasMorePosts ? 'inline-block' : 'none';
                this.elements.loadAllBtn.style.display = hasMorePosts ? 'inline-block' : 'none';
            }
        } else {
            this.elements.paginationControls.style.display = 'none';
        }
    }

    /**
     * Create a timeline post element with author info
     */
    createTimelinePost(post) {
        const userInfo = this.getUserDisplayInfo(post.pubkey);
        
        // Create the basic post element
        const postElement = ContentRenderer.createPostElement(post, {
            fetchEvent: (eventId, callback) => {
                this.relayManager.fetchEvent(eventId, callback);
            }
        });

        // Add author information at the top
        const authorInfo = document.createElement('div');
        authorInfo.className = 'post-author-info';

        const avatar = document.createElement('div');
        avatar.className = 'post-author-avatar';
        if (userInfo.avatar) {
            const img = document.createElement('img');
            img.src = userInfo.avatar;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            img.onerror = () => {
                // Fallback to initials
                avatar.textContent = userInfo.name.slice(0, 2).toUpperCase();
            };
            avatar.appendChild(img);
        } else {
            avatar.textContent = userInfo.name.slice(0, 2).toUpperCase();
        }

        const authorDetails = document.createElement('div');
        authorDetails.className = 'post-author-details';

        const authorName = document.createElement('div');
        authorName.className = 'post-author-name clickable-profile';
        authorName.textContent = userInfo.name;
        authorName.onclick = () => {
            window.open(`profile.html?pubkey=${userInfo.pubkey}`, '_blank');
        };

        const authorPubkey = document.createElement('div');
        authorPubkey.className = 'post-author-pubkey';
        authorPubkey.textContent = userInfo.pubkey.slice(0, 16) + '...';

        authorDetails.appendChild(authorName);
        authorDetails.appendChild(authorPubkey);
        authorInfo.appendChild(avatar);
        authorInfo.appendChild(authorDetails);

        // Insert author info at the beginning of the post
        postElement.insertBefore(authorInfo, postElement.firstChild);

        return postElement;
    }

    /**
     * Load reactions for a specific post
     */
    loadPostReactions(eventId) {
        // Skip if already loading reactions for this post
        if (this.reactionsLoading.has(eventId)) {
            console.log(`Already loading reactions for post: ${eventId.slice(0, 8)}, skipping`);
            return;
        }
        
        this.reactionsLoading.add(eventId);
        console.log(`Starting to load reactions for post: ${eventId.slice(0, 8)}`);
        
        const reactionsFilter = {
            kinds: [7],
            '#e': [eventId],
            limit: 50
        };

        const subscriptionId = `reactions_${eventId.slice(0, 8)}`;
        
        this.relayManager.subscribe(subscriptionId, reactionsFilter, (reactionEvent, relayUrl) => {
            console.log(`Found reaction for ${eventId.slice(0, 8)} from ${relayUrl}:`, reactionEvent);
            
            if (!this.reactions.has(eventId)) {
                this.reactions.set(eventId, []);
            }
            
            // Check for duplicate reactions
            const existingReaction = this.reactions.get(eventId).find(r => r.id === reactionEvent.id);
            if (!existingReaction) {
                this.reactions.get(eventId).push(reactionEvent);
                console.log(`Added reaction, total for this post: ${this.reactions.get(eventId).length}`);
                this.updatePostReactions(eventId);
            }
        });

        // Set a fallback timeout to show "No reactions yet" if none are found
        setTimeout(() => {
            const reactions = this.reactions.get(eventId) || [];
            if (reactions.length === 0) {
                console.log(`No reactions found after timeout for post: ${eventId.slice(0, 8)}`);
                this.updatePostReactions(eventId);
            }
        }, 3000);

        // Clean up subscription after a delay
        setTimeout(() => {
            this.relayManager.unsubscribe(subscriptionId);
            this.reactionsLoading.delete(eventId); // Remove from loading set
            console.log(`Cleaned up reactions subscription for ${eventId.slice(0, 8)}`);
        }, 8000);
    }

    /**
     * Update reactions display for a specific post
     */
    updatePostReactions(eventId) {
        console.log(`Updating reactions display for post: ${eventId.slice(0, 8)}`);
        
        const reactionsContainer = document.getElementById(`reactions-${eventId}`);
        if (!reactionsContainer) {
            console.log(`No reactions container found for post: ${eventId.slice(0, 8)}, retrying in 200ms`);
            // Retry after a short delay in case the DOM isn't ready yet
            setTimeout(() => {
                const retryContainer = document.getElementById(`reactions-${eventId}`);
                if (retryContainer) {
                    console.log(`Found reactions container on retry for post: ${eventId.slice(0, 8)}`);
                    this._doUpdatePostReactions(eventId, retryContainer);
                } else {
                    console.log(`Still no reactions container found for post: ${eventId.slice(0, 8)} after retry`);
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
        console.log(`Found ${reactions.length} reactions for post: ${eventId.slice(0, 8)}`);
        
        if (reactions.length === 0) {
            reactionsContainer.innerHTML = '<span class="reactions-loading">No reactions yet</span>';
            return;
        }

        // Group reactions by content (emoji)
        const reactionGroups = {};
        reactions.forEach(reaction => {
            const emoji = reaction.content || '👍';
            console.log(`Processing reaction with emoji: ${emoji}`);
            if (!reactionGroups[emoji]) {
                reactionGroups[emoji] = [];
            }
            reactionGroups[emoji].push(reaction);
        });

        // Clear loading message
        reactionsContainer.innerHTML = '';

        // Display each reaction group
        Object.entries(reactionGroups).forEach(([emoji, reactionList]) => {
            console.log(`Creating reaction display for ${emoji}: ${reactionList.length} reactions`);
            
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
        
        console.log(`Updated reactions display completed for post: ${eventId.slice(0, 8)}`);
    }

    /**
     * Update stats display
     */
    updateStats() {
        this.elements.followingCount.textContent = this.following.length;
        this.elements.postsCount.textContent = this.timelinePosts.length;
        this.elements.relaysCount.textContent = this.relayManager.getConnectedCount();
        this.showStats();
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.elements.loading.style.display = 'block';
        this.elements.error.style.display = 'none';
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
     * Show/hide UI sections
     */
    showStats() {
        this.elements.stats.style.display = 'flex';
    }

    hideStats() {
        this.elements.stats.style.display = 'none';
    }

    showTimeline() {
        this.elements.timeline.style.display = 'block';
    }

    hideTimeline() {
        this.elements.timeline.style.display = 'none';
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.relayManager.closeAllConnections();
    }
}

// Make functions available globally
window.loadWall = function() {
    if (!window.wallFeed) {
        window.wallFeed = new WallFeed();
    }
    window.wallFeed.loadWall();
};

window.loadMorePosts = function() {
    if (window.wallFeed) {
        window.wallFeed.loadMorePosts();
    }
};

window.loadAllPosts = function() {
    if (window.wallFeed) {
        window.wallFeed.loadAllPosts();
    }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.wallFeed) {
        window.wallFeed.destroy();
    }
});

// Handle enter key in input
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userPubkey').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadWall();
        }
    });
});