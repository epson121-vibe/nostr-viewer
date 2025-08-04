/**
 * Relay connection and event management for Nostr
 */

class RelayManager {
    constructor() {
        this.activeConnections = [];
        this.eventHandlers = new Map();
        this.subscriptions = new Map();
    }

    /**
     * Default relay list
     */
    static get DEFAULT_RELAYS() {
        return [
            'wss://relay.damus.io',
            'wss://nostr-pub.wellorder.net',
            'wss://eden.nostr.land',
            'wss://nostr.fmt.wiz.biz',
            'wss://relay.nostr.info'
        ];
    }

    /**
     * Connect to a single relay
     */
    async connectToRelay(url) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            let resolved = false;
            
            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.log(`Connection timeout for ${url}`);
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
            
            ws.onopen = () => {
                console.log(`✓ Connected to ${url}`);
                clearTimeout(timeout);
                resolved = true;
                
                // Set up message handling
                ws.onmessage = (event) => this.handleRelayMessage(url, event);
                
                resolve(ws);
            };
            
            ws.onerror = (error) => {
                console.error(`✗ Failed to connect to ${url}:`, error);
                clearTimeout(timeout);
                if (!resolved) {
                    resolved = true;
                    reject(error);
                }
            };
            
            ws.onclose = () => {
                console.log(`Disconnected from ${url}`);
                this.removeConnection(ws);
            };
        });
    }

    /**
     * Connect to multiple relays
     */
    async connectToRelays(relayUrls = RelayManager.DEFAULT_RELAYS) {
        const connectionPromises = relayUrls.map(async (relay) => {
            try {
                const ws = await this.connectToRelay(relay);
                this.activeConnections.push({ url: relay, ws });
                return { url: relay, ws, success: true };
            } catch (error) {
                console.error(`Failed to connect to ${relay}:`, error);
                return { url: relay, error, success: false };
            }
        });
        
        return await Promise.allSettled(connectionPromises);
    }

    /**
     * Handle incoming messages from relays
     */
    handleRelayMessage(relayUrl, event) {
        try {
            const message = JSON.parse(event.data);
            console.log(`Message from ${relayUrl}:`, message[0], message[1]);
            
            const [type, subscriptionId, eventData] = message;
            
            if (type === 'EVENT' && eventData) {
                this.handleEvent(relayUrl, subscriptionId, eventData);
            } else if (type === 'EOSE') {
                console.log(`End of stored events from ${relayUrl} (${subscriptionId})`);
                this.handleEndOfStoredEvents(relayUrl, subscriptionId);
            } else if (type === 'CLOSED') {
                console.log(`Subscription closed by ${relayUrl} (${subscriptionId})`);
            } else if (type === 'AUTH') {
                console.log(`Auth challenge from ${relayUrl}:`, message[1]);
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    }

    /**
     * Handle individual events
     */
    handleEvent(relayUrl, subscriptionId, eventData) {
        console.log(`Found event kind ${eventData.kind} from ${eventData.pubkey.slice(0,8)}... (subscription: ${subscriptionId})`);
        
        // Call registered event handlers
        const handlers = this.eventHandlers.get(subscriptionId);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(eventData, relayUrl);
                } catch (e) {
                    console.error('Error in event handler:', e);
                }
            });
        }
    }

    /**
     * Handle end of stored events
     */
    handleEndOfStoredEvents(relayUrl, subscriptionId) {
        // Notify handlers that initial sync is complete
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription && subscription.onEOSE) {
            subscription.onEOSE(relayUrl);
        }
    }

    /**
     * Subscribe to events from all connected relays
     */
    subscribe(subscriptionId, filters, eventHandler, options = {}) {
        // Store the subscription
        this.subscriptions.set(subscriptionId, {
            filters,
            handler: eventHandler,
            onEOSE: options.onEOSE
        });

        // Register event handler
        if (!this.eventHandlers.has(subscriptionId)) {
            this.eventHandlers.set(subscriptionId, []);
        }
        this.eventHandlers.get(subscriptionId).push(eventHandler);

        // Send subscription to all connected relays
        const reqMessage = JSON.stringify(['REQ', subscriptionId, filters]);
        
        this.activeConnections.forEach(({ url, ws }) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(reqMessage);
                console.log(`Sent subscription ${subscriptionId} to ${url}`);
            }
        });
    }

    /**
     * Unsubscribe from events
     */
    unsubscribe(subscriptionId) {
        // Remove handlers and subscription
        this.eventHandlers.delete(subscriptionId);
        this.subscriptions.delete(subscriptionId);

        // Send close message to relays
        const closeMessage = JSON.stringify(['CLOSE', subscriptionId]);
        
        this.activeConnections.forEach(({ ws }) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(closeMessage);
            }
        });
    }

    /**
     * Remove a connection from active list
     */
    removeConnection(ws) {
        this.activeConnections = this.activeConnections.filter(conn => conn.ws !== ws);
    }

    /**
     * Close all connections
     */
    closeAllConnections() {
        this.activeConnections.forEach(({ ws }) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
        this.activeConnections = [];
        this.eventHandlers.clear();
        this.subscriptions.clear();
    }

    /**
     * Get connected relay count
     */
    getConnectedCount() {
        return this.activeConnections.filter(({ ws }) => 
            ws.readyState === WebSocket.OPEN
        ).length;
    }

    /**
     * Subscribe to profile data
     */
    subscribeToProfile(pubkey, handler) {
        const profileFilters = {
            kinds: [0],
            authors: [pubkey],
            limit: 1
        };
        
        this.subscribe('profile', profileFilters, handler);
    }

    /**
     * Subscribe to posts/notes
     */
    subscribeToPosts(pubkey, handler, limit = 20) {
        const postsFilters = {
            kinds: [1],
            authors: [pubkey],
            limit: limit
        };
        
        this.subscribe('posts', postsFilters, handler);
    }

    /**
     * Fetch a specific event by ID
     */
    fetchEvent(eventId, handler) {
        const subscriptionId = `event_${eventId.slice(0, 8)}`;
        
        const eventFilters = {
            ids: [eventId],
            limit: 1
        };
        
        // Set up one-time handler
        const oneTimeHandler = (eventData, relayUrl) => {
            if (eventData.id === eventId) {
                handler(eventData);
                // Unsubscribe after receiving the event
                setTimeout(() => this.unsubscribe(subscriptionId), 1000);
            }
        };
        
        this.subscribe(subscriptionId, eventFilters, oneTimeHandler, {
            onEOSE: (relayUrl) => {
                // If no event found after EOSE from all relays, clean up
                setTimeout(() => {
                    if (this.subscriptions.has(subscriptionId)) {
                        console.log(`Event ${eventId.slice(0, 8)}... not found`);
                        this.unsubscribe(subscriptionId);
                    }
                }, 2000);
            }
        });
    }
}