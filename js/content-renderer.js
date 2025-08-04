/**
 * Content rendering and UI utilities for Nostr
 */

class ContentRenderer {
    
    /**
     * Check if URL is an image
     */
    static isImageUrl(url) {
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
    }

    /**
     * Check if URL is a video
     */
    static isVideoUrl(url) {
        return /\.(mp4|webm|ogg|mov|avi|mkv|m4v)(\?.*)?$/i.test(url);
    }

    /**
     * Check if URL is a YouTube video
     */
    static isYouTubeUrl(url) {
        return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/.test(url);
    }

    /**
     * Extract YouTube video ID
     */
    static getYouTubeVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    /**
     * Parse nostr references (note1, npub, etc.)
     */
    static parseNostrReferences(content) {
        const nostrRegex = /nostr:(note1[a-z0-9]+|npub1[a-z0-9]+|nevent1[a-z0-9]+|nprofile1[a-z0-9]+)/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        
        while ((match = nostrRegex.exec(content)) !== null) {
            // Add text before the reference
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: content.slice(lastIndex, match.index)
                });
            }
            
            // Add the nostr reference
            const fullRef = match[0]; // e.g., "nostr:note1abc123..."
            const identifier = match[1]; // e.g., "note1abc123..."
            
            if (identifier.startsWith('note1')) {
                parts.push({
                    type: 'note_reference',
                    identifier: identifier,
                    fullRef: fullRef
                });
            } else if (identifier.startsWith('npub1')) {
                parts.push({
                    type: 'profile_reference',
                    identifier: identifier,
                    fullRef: fullRef
                });
            } else if (identifier.startsWith('nevent1')) {
                parts.push({
                    type: 'event_reference',
                    identifier: identifier,
                    fullRef: fullRef
                });
            } else if (identifier.startsWith('nprofile1')) {
                parts.push({
                    type: 'profile_reference',
                    identifier: identifier,
                    fullRef: fullRef
                });
            }
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text
        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                content: content.slice(lastIndex)
            });
        }
        
        return parts;
    }

    /**
     * Parse post content into text, links, images, and nostr references
     */
    static parsePostContent(content) {
        // First parse nostr references
        let parts = this.parseNostrReferences(content);
        
        // Then parse URLs in text parts
        const finalParts = [];
        
        parts.forEach(part => {
            if (part.type === 'text') {
                // Parse URLs in this text part
                const urlParts = this.parseUrls(part.content);
                finalParts.push(...urlParts);
            } else {
                // Keep non-text parts as-is
                finalParts.push(part);
            }
        });
        
        return finalParts;
    }

    /**
     * Parse URLs in text content
     */
    static parseUrls(content) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        
        while ((match = urlRegex.exec(content)) !== null) {
            // Add text before the URL
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: content.slice(lastIndex, match.index)
                });
            }
            
            // Add the URL
            const url = match[0];
            if (this.isImageUrl(url)) {
                parts.push({
                    type: 'image',
                    url: url
                });
            } else if (this.isVideoUrl(url)) {
                parts.push({
                    type: 'video',
                    url: url
                });
            } else if (this.isYouTubeUrl(url)) {
                const videoId = this.getYouTubeVideoId(url);
                parts.push({
                    type: 'youtube',
                    url: url,
                    videoId: videoId
                });
            } else {
                parts.push({
                    type: 'link',
                    url: url,
                    text: url
                });
            }
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text
        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                content: content.slice(lastIndex)
            });
        }
        
        return parts;
    }

    /**
     * Create image element with error handling
     */
    static createImageElement(url) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'post-image';
        img.alt = 'Posted image';
        
        img.onerror = function() {
            // If image fails to load, show as link instead
            const link = ContentRenderer.createLinkElement(url, url);
            this.parentNode.replaceChild(link, this);
        };
        
        return img;
    }

    /**
     * Create link element
     */
    static createLinkElement(url, text) {
        const link = document.createElement('a');
        link.href = url;
        link.textContent = text;
        link.className = 'post-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
    }

    /**
     * Create video element with error handling
     */
    static createVideoElement(url) {
        const video = document.createElement('video');
        video.src = url;
        video.className = 'post-video';
        video.controls = true;
        video.preload = 'metadata';
        
        video.onerror = function() {
            // If video fails to load, show as link instead
            const link = ContentRenderer.createLinkElement(url, url);
            this.parentNode.replaceChild(link, this);
        };
        
        return video;
    }

    /**
     * Create YouTube embed element
     */
    static createYouTubeEmbed(videoId, originalUrl) {
        const embedContainer = document.createElement('div');
        embedContainer.className = 'youtube-embed';
        
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.title = 'YouTube video';
        
        iframe.onerror = function() {
            // If embed fails, show as link instead
            const link = ContentRenderer.createLinkElement(originalUrl, originalUrl);
            embedContainer.parentNode.replaceChild(link, embedContainer);
        };
        
        embedContainer.appendChild(iframe);
        return embedContainer;
    }

    /**
     * Create embedded post placeholder
     */
    static createEmbeddedPostPlaceholder(identifier, type) {
        const embeddedDiv = document.createElement('div');
        embeddedDiv.className = 'embedded-post';
        embeddedDiv.dataset.identifier = identifier;
        embeddedDiv.dataset.type = type;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'embedded-post-loading';
        loadingDiv.textContent = `Loading ${type}...`;
        
        embeddedDiv.appendChild(loadingDiv);
        return embeddedDiv;
    }

    /**
     * Create nostr reference element
     */
    static createNostrReference(identifier, fullRef) {
        const span = document.createElement('span');
        span.className = 'nostr-reference';
        span.textContent = identifier;
        span.title = fullRef;
        span.dataset.identifier = identifier;
        return span;
    }

    /**
     * Render post content with mixed media and nostr references
     */
    static renderPostContent(content, eventFetcher = null) {
        const parts = this.parsePostContent(content);
        const container = document.createElement('div');
        container.className = 'post-content';
        
        parts.forEach(part => {
            if (part.type === 'text') {
                const textNode = document.createTextNode(part.content);
                container.appendChild(textNode);
            } else if (part.type === 'image') {
                const img = this.createImageElement(part.url);
                container.appendChild(img);
            } else if (part.type === 'video') {
                const video = this.createVideoElement(part.url);
                container.appendChild(video);
            } else if (part.type === 'youtube') {
                const youtubeEmbed = this.createYouTubeEmbed(part.videoId, part.url);
                container.appendChild(youtubeEmbed);
            } else if (part.type === 'link') {
                const link = this.createLinkElement(part.url, part.text);
                container.appendChild(link);
            } else if (part.type === 'note_reference') {
                // Create embedded post
                const embeddedPost = this.createEmbeddedPostPlaceholder(part.identifier, 'note');
                container.appendChild(embeddedPost);
                
                // Try to fetch the referenced event
                if (eventFetcher) {
                    try {
                        const decoded = CryptoUtils.decodeNostrReference(part.identifier);
                        if (decoded.type === 'eventid') {
                            eventFetcher.fetchEvent(decoded.hex, (event) => {
                                this.renderEmbeddedPost(embeddedPost, event);
                            });
                        }
                    } catch (e) {
                        console.error('Error decoding note reference:', e);
                        embeddedPost.innerHTML = `<div class="embedded-post-loading">Error loading note</div>`;
                    }
                }
            } else if (part.type === 'profile_reference') {
                // Just show as a clickable reference for now
                const ref = this.createNostrReference(part.identifier, part.fullRef);
                container.appendChild(ref);
            } else if (part.type === 'event_reference') {
                // Similar to note_reference but for nevent
                const embeddedPost = this.createEmbeddedPostPlaceholder(part.identifier, 'event');
                container.appendChild(embeddedPost);
            }
        });
        
        return container;
    }

    /**
     * Render an embedded post once data is fetched
     */
    static renderEmbeddedPost(container, event) {
        container.innerHTML = '';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'embedded-post-header';
        headerDiv.textContent = `📝 ${ContentRenderer.formatTimestamp(event.created_at)} • ${event.pubkey.slice(0, 8)}...`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'embedded-post-content';
        
        if (event.kind === 1) {
            // Text note - render content but without recursive embedding to avoid infinite loops
            contentDiv.textContent = event.content;
        } else {
            contentDiv.textContent = `Event kind ${event.kind}`;
        }
        
        container.appendChild(headerDiv);
        container.appendChild(contentDiv);
    }

    /**
     * Check if post is a reply by looking for 'e' tags
     */
    static isReply(post) {
        return post.tags && post.tags.some(tag => tag[0] === 'e');
    }

    /**
     * Get the event ID this post is replying to
     */
    static getReplyToEventId(post) {
        if (!post.tags) return null;
        
        // Find the 'e' tag - usually the last one is the direct reply
        const eTags = post.tags.filter(tag => tag[0] === 'e');
        if (eTags.length === 0) return null;
        
        // Return the last 'e' tag's event ID (most direct reply)
        return eTags[eTags.length - 1][1];
    }

    /**
     * Create reply indicator
     */
    static createReplyIndicator(replyToEventId, eventFetcher = null) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'reply-indicator';
        replyDiv.textContent = `Replying to ${replyToEventId.slice(0, 8)}...`;
        replyDiv.title = `Click to view original post: ${replyToEventId}`;
        
        // Make it clickable to open thread
        replyDiv.onclick = () => {
            window.open(`thread.html?id=${replyToEventId}`, '_blank');
        };
        
        return replyDiv;
    }

    /**
     * Create thread link
     */
    static createThreadLink(eventId) {
        const threadLink = document.createElement('span');
        threadLink.className = 'thread-link';
        threadLink.textContent = 'View thread';
        threadLink.onclick = () => {
            window.open(`thread.html?id=${eventId}`, '_blank');
        };
        return threadLink;
    }

    /**
     * Create a single post element
     */
    static createPostElement(post, eventFetcher = null) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.dataset.eventId = post.id;
        
        // Check if this is a reply
        const isReply = this.isReply(post);
        const replyToEventId = isReply ? this.getReplyToEventId(post) : null;
        
        // Reply indicator (if this is a reply)
        if (isReply && replyToEventId) {
            const replyIndicator = this.createReplyIndicator(replyToEventId, eventFetcher);
            postDiv.appendChild(replyIndicator);
        }
        
        // Date header
        const dateDiv = document.createElement('div');
        dateDiv.className = 'post-date';
        dateDiv.textContent = new Date(post.created_at * 1000).toLocaleString();
        
        // Content with media and references
        const contentDiv = this.renderPostContent(post.content, eventFetcher);
        
        // Reactions placeholder (will be populated by individual apps)
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'post-reactions';
        reactionsDiv.id = `reactions-${post.id}`;
        reactionsDiv.innerHTML = '<span class="reactions-loading">Loading reactions...</span>';
        
        // Event ID footer with thread link
        const footerDiv = document.createElement('div');
        const idDiv = document.createElement('span');
        idDiv.className = 'post-id';
        idDiv.textContent = `ID: ${post.id.slice(0, 16)}...`;
        
        const threadLink = this.createThreadLink(post.id);
        
        footerDiv.appendChild(idDiv);
        footerDiv.appendChild(document.createTextNode(' • '));
        footerDiv.appendChild(threadLink);
        
        postDiv.appendChild(dateDiv);
        postDiv.appendChild(contentDiv);
        postDiv.appendChild(reactionsDiv);
        postDiv.appendChild(footerDiv);
        
        return postDiv;
    }

    /**
     * Render multiple posts
     */
    static renderPosts(posts, container, eventFetcher = null) {
        if (!posts || posts.length === 0) {
            container.innerHTML = '<p>No posts found.</p>';
            return;
        }
        
        // Sort posts by created_at (newest first)
        const sortedPosts = [...posts].sort((a, b) => b.created_at - a.created_at);
        
        // Clear container
        container.innerHTML = '';
        
        // Add posts
        sortedPosts.forEach(post => {
            const postElement = this.createPostElement(post, eventFetcher);
            container.appendChild(postElement);
        });
    }

    /**
     * Format timestamp for display
     */
    static formatTimestamp(timestamp) {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) {
            return 'just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

/**
 * UI Manager for handling DOM updates and user interactions
 */
class UIManager {
    constructor() {
        this.elements = {};
        this.initializeElements();
    }

    /**
     * Cache DOM elements
     */
    initializeElements() {
        this.elements = {
            pubkeyInput: document.getElementById('pubkey'),
            loadingDiv: document.getElementById('loading'),
            errorDiv: document.getElementById('error'),
            profileDiv: document.getElementById('profile'),
            postsDiv: document.getElementById('posts'),
            postsListDiv: document.getElementById('postsList'),
            profilePicture: document.getElementById('profilePicture'),
            profileName: document.getElementById('profileName'),
            profileAbout: document.getElementById('profileAbout'),
            profilePubkey: document.getElementById('profilePubkey'),
            profileWebsite: document.getElementById('profileWebsite'),
            profileLud16: document.getElementById('profileLud16'),
            relayInfo: document.getElementById('relayInfo')
        };
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.elements.loadingDiv.style.display = 'block';
        this.elements.errorDiv.style.display = 'none';
        this.elements.profileDiv.style.display = 'none';
        this.elements.postsDiv.style.display = 'none';
    }

    /**
     * Show error message
     */
    showError(message) {
        this.elements.errorDiv.textContent = message;
        this.elements.errorDiv.style.display = 'block';
        this.elements.loadingDiv.style.display = 'none';
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        this.elements.loadingDiv.style.display = 'none';
    }

    /**
     * Display profile information
     */
    displayProfile(profile, connectedRelays = 0) {
        this.hideLoading();
        this.elements.profileDiv.style.display = 'block';
        
        // Profile picture
        if (profile.picture) {
            this.elements.profilePicture.src = profile.picture;
            this.elements.profilePicture.style.display = 'block';
        } else {
            this.elements.profilePicture.style.display = 'none';
        }
        
        // Basic info
        this.elements.profileName.textContent = profile.name || profile.display_name || 'No name set';
        this.elements.profileAbout.textContent = profile.about || 'No bio available';
        this.elements.profilePubkey.textContent = profile.pubkey;
        
        // Website
        if (profile.website) {
            this.elements.profileWebsite.href = profile.website;
            this.elements.profileWebsite.textContent = profile.website;
            this.elements.profileWebsite.parentElement.style.display = 'block';
        } else {
            this.elements.profileWebsite.parentElement.style.display = 'none';
        }
        
        // Lightning address
        if (profile.lud16) {
            this.elements.profileLud16.textContent = profile.lud16;
            this.elements.profileLud16.parentElement.style.display = 'block';
        } else {
            this.elements.profileLud16.parentElement.style.display = 'none';
        }
        
        // Relay info
        this.elements.relayInfo.innerHTML = 
            `<strong>Connected to ${connectedRelays} relays</strong><br>` +
            `Profile last updated: ${new Date(profile.created_at * 1000).toLocaleString()}`;
    }

    /**
     * Display posts
     */
    displayPosts(posts, eventFetcher = null) {
        if (posts && posts.length > 0) {
            ContentRenderer.renderPosts(posts, this.elements.postsListDiv, eventFetcher);
            this.elements.postsDiv.style.display = 'block';
        }
    }

    /**
     * Get user input
     */
    getUserInput() {
        return this.elements.pubkeyInput.value.trim();
    }

    /**
     * Clear user input
     */
    clearInput() {
        this.elements.pubkeyInput.value = '';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners(callbacks) {
        // Enter key on input
        this.elements.pubkeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && callbacks.onSubmit) {
                callbacks.onSubmit();
            }
        });
    }
}