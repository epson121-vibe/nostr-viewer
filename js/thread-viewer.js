/**
 * Thread Viewer for displaying Nostr conversation threads
 */

class ThreadViewer {
    constructor() {
        this.relayManager = new RelayManager();
        this.originalPost = null;
        this.replies = [];
        this.reactions = new Map(); // eventId -> reactions
        this.reactionsLoading = new Set(); // track which posts are loading reactions
        this.profiles = new Map(); // pubkey -> profile data
        this.elements = this.initializeElements();
        this.initializeApp();
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        return {
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            originalPost: document.getElementById('originalPost'),
            originalContent: document.getElementById('originalContent'),
            repliesSection: document.getElementById('repliesSection'),
            repliesList: document.getElementById('repliesList'),
            repliesCount: document.getElementById('repliesCount'),
            noReplies: document.getElementById('noReplies')
        };
    }

    /**
     * Initialize the application
     */
    async initializeApp() {
        // Get event ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('id');
        
        if (!eventId) {
            this.showError('No event ID provided in URL');
            return;
        }

        console.log('Loading thread for event:', eventId);
        
        try {
            // Connect to relays
            await this.relayManager.connectToRelays();
            
            // Load the thread
            await this.loadThread(eventId);
            
        } catch (error) {
            console.error('Error initializing thread viewer:', error);
            this.showError('Failed to connect to relays: ' + error.message);
        }
    }

    /**
     * Load thread data
     */
    async loadThread(eventId) {
        this.showLoading();
        
        // First, fetch the original post
        this.relayManager.fetchEvent(eventId, (originalEvent) => {
            console.log('Loaded original post:', originalEvent);
            // Only set if we haven't already loaded it (prevent duplicates from multiple relays)
            if (!this.originalPost) {
                this.originalPost = originalEvent;
                this.displayOriginalPost();
            }
        });

        // Then, fetch all replies
        this.fetchReplies(eventId);
        
        // Set timeout to hide loading if nothing found
        setTimeout(() => {
            this.hideLoading();
            if (!this.originalPost) {
                this.showError('Original post not found. It may have been deleted or is not available on these relays.');
            }
        }, 5000);
    }

    /**
     * Fetch all replies to a post
     */
    fetchReplies(eventId) {
        const repliesFilter = {
            kinds: [1],
            '#e': [eventId],
            limit: 100
        };

        this.relayManager.subscribe('replies', repliesFilter, (replyEvent, relayUrl) => {
            console.log(`Found reply from ${relayUrl}:`, replyEvent);
            
            // Avoid duplicates
            const existingReply = this.replies.find(r => r.id === replyEvent.id);
            if (!existingReply) {
                this.replies.push(replyEvent);
                this.displayReplies();
            }
        });
    }

    /**
     * Display the original post
     */
    displayOriginalPost() {
        this.hideLoading();
        
        const postElement = ContentRenderer.createPostElement(this.originalPost, {
            fetchEvent: (eventId, callback) => {
                this.relayManager.fetchEvent(eventId, callback);
            }
        });
        
        // Add author info
        const authorDiv = document.createElement('div');
        authorDiv.className = 'post-author';
        
        const authorLabel = document.createElement('span');
        authorLabel.textContent = 'Author: ';
        
        const authorLink = document.createElement('span');
        authorLink.className = 'clickable-profile';
        authorLink.textContent = `${this.originalPost.pubkey.slice(0, 16)}...`;
        authorLink.title = `View profile for ${this.originalPost.pubkey}`;
        authorLink.onclick = () => {
            window.open(`profile.html?pubkey=${this.originalPost.pubkey}`, '_blank');
        };
        
        authorDiv.appendChild(authorLabel);
        authorDiv.appendChild(authorLink);
        postElement.insertBefore(authorDiv, postElement.firstChild);
        
        this.elements.originalContent.appendChild(postElement);
        this.elements.originalPost.style.display = 'block';
        
        // Load reactions for the original post
        setTimeout(() => {
            this.loadPostReactions(this.originalPost.id);
        }, 100);
        
        // Load profile for the original post author
        this.loadUserProfile(this.originalPost.pubkey);
        
        // Update page title
        const content = this.originalPost.content.slice(0, 50);
        document.title = `Thread: ${content}${content.length < this.originalPost.content.length ? '...' : ''}`;
    }

    /**
     * Display replies
     */
    displayReplies() {
        if (this.replies.length === 0) {
            this.elements.noReplies.style.display = 'block';
            return;
        }

        // Sort replies by timestamp (oldest first for conversation flow)
        const sortedReplies = [...this.replies].sort((a, b) => a.created_at - b.created_at);
        
        // Clear existing replies
        this.elements.repliesList.innerHTML = '';
        
        // Add each reply
        sortedReplies.forEach(reply => {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'reply';
            
            const postElement = ContentRenderer.createPostElement(reply, {
                fetchEvent: (eventId, callback) => {
                    this.relayManager.fetchEvent(eventId, callback);
                }
            });
            
            // Add author info
            const authorDiv = document.createElement('div');
            authorDiv.className = 'post-author';
            
            const authorLink = document.createElement('span');
            authorLink.className = 'clickable-profile';
            authorLink.textContent = `${reply.pubkey.slice(0, 16)}...`;
            authorLink.title = `View profile for ${reply.pubkey}`;
            authorLink.onclick = () => {
                window.open(`profile.html?pubkey=${reply.pubkey}`, '_blank');
            };
            
            authorDiv.appendChild(authorLink);
            postElement.insertBefore(authorDiv, postElement.firstChild);
            
            replyDiv.appendChild(postElement);
            this.elements.repliesList.appendChild(replyDiv);
            
            // Load reactions for this reply
            setTimeout(() => {
                this.loadPostReactions(reply.id);
            }, 100);
        });
        
        // Update UI
        this.elements.repliesCount.textContent = this.replies.length;
        this.elements.repliesSection.style.display = 'block';
        this.elements.noReplies.style.display = 'none';
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
     * Load reactions for a specific post
     */
    loadPostReactions(eventId) {
        // Skip if already loading reactions for this post
        if (this.reactionsLoading.has(eventId)) {
            console.log(`[Thread] Already loading reactions for post: ${eventId.slice(0, 8)}, skipping`);
            return;
        }
        
        this.reactionsLoading.add(eventId);
        console.log(`[Thread] Starting to load reactions for post: ${eventId.slice(0, 8)}`);
        
        const reactionsFilter = {
            kinds: [7],
            '#e': [eventId],
            limit: 50
        };

        const subscriptionId = `reactions_${eventId.slice(0, 8)}`;
        
        this.relayManager.subscribe(subscriptionId, reactionsFilter, (reactionEvent, relayUrl) => {
            console.log(`[Thread] Found reaction for ${eventId.slice(0, 8)} from ${relayUrl}:`, reactionEvent);
            
            if (!this.reactions.has(eventId)) {
                this.reactions.set(eventId, []);
            }
            
            // Check for duplicate reactions
            const existingReaction = this.reactions.get(eventId).find(r => r.id === reactionEvent.id);
            if (!existingReaction) {
                this.reactions.get(eventId).push(reactionEvent);
                console.log(`[Thread] Added reaction, total for this post: ${this.reactions.get(eventId).length}`);
                this.updatePostReactions(eventId);
            }
        });

        // Set a fallback timeout to show "No reactions yet" if none are found
        setTimeout(() => {
            const reactions = this.reactions.get(eventId) || [];
            if (reactions.length === 0) {
                console.log(`[Thread] No reactions found after timeout for post: ${eventId.slice(0, 8)}`);
                this.updatePostReactions(eventId);
            }
        }, 3000);

        // Clean up subscription after a delay
        setTimeout(() => {
            this.relayManager.unsubscribe(subscriptionId);
            this.reactionsLoading.delete(eventId); // Remove from loading set
            console.log(`[Thread] Cleaned up reactions subscription for ${eventId.slice(0, 8)}`);
        }, 8000);
    }

    /**
     * Update reactions display for a specific post
     */
    updatePostReactions(eventId) {
        console.log(`[Thread] Updating reactions display for post: ${eventId.slice(0, 8)}`);
        
        const reactionsContainer = document.getElementById(`reactions-${eventId}`);
        if (!reactionsContainer) {
            console.log(`[Thread] No reactions container found for post: ${eventId.slice(0, 8)}, retrying in 200ms`);
            // Retry after a short delay in case the DOM isn't ready yet
            setTimeout(() => {
                const retryContainer = document.getElementById(`reactions-${eventId}`);
                if (retryContainer) {
                    console.log(`[Thread] Found reactions container on retry for post: ${eventId.slice(0, 8)}`);
                    this._doUpdatePostReactions(eventId, retryContainer);
                } else {
                    console.log(`[Thread] Still no reactions container found for post: ${eventId.slice(0, 8)} after retry`);
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
        console.log(`[Thread] Found ${reactions.length} reactions for post: ${eventId.slice(0, 8)}`);
        
        if (reactions.length === 0) {
            reactionsContainer.innerHTML = '<span class="reactions-loading">No reactions yet</span>';
            return;
        }

        // Group reactions by content (emoji)
        const reactionGroups = {};
        reactions.forEach(reaction => {
            const emoji = reaction.content || '👍';
            console.log(`[Thread] Processing reaction with emoji: ${emoji}`);
            if (!reactionGroups[emoji]) {
                reactionGroups[emoji] = [];
            }
            reactionGroups[emoji].push(reaction);
        });

        // Clear loading message
        reactionsContainer.innerHTML = '';

        // Display each reaction group
        Object.entries(reactionGroups).forEach(([emoji, reactionList]) => {
            console.log(`[Thread] Creating reaction display for ${emoji}: ${reactionList.length} reactions`);
            
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
        
        console.log(`[Thread] Updated reactions display completed for post: ${eventId.slice(0, 8)}`);
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
    window.threadViewer = new ThreadViewer();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.threadViewer) {
        window.threadViewer.destroy();
    }
});