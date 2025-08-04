# Nostr Viewer

A simple, viewer-only web application for browsing the Nostr protocol. View profiles, explore timelines, and read conversations without needing to manage private keys.

## 🌐 Live Demo

**[Try it here: https://epson121-vibe.github.io/nostr-viewer/index.html](https://epson121-vibe.github.io/nostr-viewer/index.html)**

## ✨ Features

### 📋 Profile Viewer
- Enter any npub or hex public key to view user profiles
- See profile information, bio, website, and lightning address
- View user statistics (posts, following count)
- Browse user's latest posts

### 🌊 Wall Feed
- Enter your public key to see a timeline of posts from people you follow
- Pagination with infinite scroll or "Load More" options
- Author avatars and clickable profile links
- Real-time loading from multiple Nostr relays

### 💬 Thread Viewer
- View complete conversation threads
- See original posts with all replies in chronological order
- Navigate to threads by clicking "View thread" on any post

### 🎯 Individual Profile Pages
- Dedicated profile pages with detailed user information
- User statistics and latest posts
- Clickable from anywhere in the app

### 👍 Reaction System
- View reaction counts and emoji indicators on all posts
- See what reactions posts have received
- Real-time loading from Nostr relays

### 🎨 Media Support
- **Images**: Automatic image display with error handling
- **Videos**: HTML5 video player with controls
- **YouTube**: Embedded YouTube videos
- **Links**: Clickable external links

### 🔗 Smart Navigation
- Clickable profile names throughout the app
- Thread navigation from any post
- Cross-page navigation between all features

## 🚀 Getting Started

### Online Usage
Simply visit the live demo and start exploring:
1. Go to [https://epson121-vibe.github.io/nostr-viewer/index.html](https://epson121-vibe.github.io/nostr-viewer/index.html)
2. Enter any npub or hex public key to view a profile
3. Try the Wall Feed to see timelines from followed users
4. Click on any post to view its thread

### Local Development
1. Clone this repository:
   ```bash
   git clone https://github.com/epson121-vibe/nostr-viewer.git
   cd nostr-viewer
   ```

2. Serve the files using any web server:
   ```bash
   # Using Python
   python3 -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

3. Open `http://localhost:8000` in your browser

## 🏗️ Architecture

### Core Components
- **`crypto-utils.js`** - Key conversion utilities (npub ↔ hex)
- **`relay-manager.js`** - WebSocket connections to Nostr relays
- **`content-renderer.js`** - Post rendering with media support
- **`wall-feed.js`** - Timeline functionality with pagination
- **`profile-viewer.js`** - Profile page logic
- **`thread-viewer.js`** - Thread conversation display

### Nostr Relays
The app connects to multiple public Nostr relays:
- `wss://relay.damus.io`
- `wss://eden.nostr.land`
- `wss://nostr-pub.wellorder.net`

### Event Types Supported
- **Kind 0**: User profiles (name, bio, picture, etc.)
- **Kind 1**: Text notes (posts and replies)
- **Kind 3**: Following lists
- **Kind 7**: Reactions (likes, emojis)

## 🔒 Privacy & Security

- **Viewer-Only**: No private key handling or storage
- **No Account Required**: Browse without creating accounts
- **Client-Side**: All processing happens in your browser
- **Open Source**: Full source code available for inspection

## 🎯 Use Cases

- **Explore Nostr**: Discover what's happening on the Nostr network
- **Profile Research**: Look up any user by their public key
- **Timeline Browsing**: See what people you're interested in are posting
- **Thread Reading**: Follow conversations and discussions
- **Media Viewing**: Browse images, videos, and embedded content

## 🛠️ Technical Details

### Browser Compatibility
- Modern browsers with WebSocket support
- JavaScript ES6+ features
- No external dependencies or frameworks

### Key Features
- **Cross-Relay Support**: Aggregates data from multiple relays
- **Deduplication**: Prevents duplicate posts from different relays
- **Real-Time Updates**: Live loading as new content arrives
- **Responsive Design**: Works on desktop and mobile
- **Error Handling**: Graceful fallbacks for failed connections

## 📄 Pages

- **`index.html`** - Main profile viewer
- **`wall.html`** - Timeline feed for followed users
- **`thread.html`** - Thread conversation viewer
- **`profile.html`** - Individual user profile pages

## 🤝 Contributing

This is an open-source project. Feel free to:
- Report issues or bugs
- Suggest new features
- Submit pull requests
- Fork and customize for your needs

## 📝 License

Open source - feel free to use, modify, and distribute.

---

**Built for the Nostr ecosystem** 🟣 **Viewer-only, no keys required** 🔐 **Try it now!** 🚀