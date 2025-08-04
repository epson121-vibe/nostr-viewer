/**
 * Cryptographic utilities for Nostr key handling
 */

class CryptoUtils {
    static BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    static BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

    /**
     * Decode npub to hex format
     */
    static decodeNpub(npub) {
        if (!npub.startsWith('npub1')) {
            throw new Error('Must start with npub1');
        }
        
        // Remove prefix 'npub1' and checksum (last 6 chars)
        const data = npub.slice(5, -6);
        
        // Decode bech32 characters to 5-bit values
        const decoded = [];
        for (let i = 0; i < data.length; i++) {
            const char = data[i];
            const val = this.BECH32_CHARSET.indexOf(char);
            if (val === -1) throw new Error(`Invalid character: ${char}`);
            decoded.push(val);
        }
        
        // Convert from 5-bit to 8-bit
        const converted = [];
        let acc = 0;
        let bits = 0;
        
        for (const value of decoded) {
            acc = (acc << 5) | value;
            bits += 5;
            
            while (bits >= 8) {
                bits -= 8;
                converted.push((acc >>> bits) & 0xff);
            }
        }
        
        // Remove the witness version (first byte) - for npub it should be 0
        if (converted.length > 0 && converted[0] === 0) {
            return converted.slice(1);
        }
        
        return converted;
    }

    /**
     * Calculate bech32 checksum
     */
    static bech32Checksum(hrp, data) {
        let chk = 1;
        
        for (let i = 0; i < hrp.length; i++) {
            chk ^= hrp.charCodeAt(i) >> 5;
            chk = (chk << 5) ^ (chk >> 27);
            for (let j = 0; j < 5; j++) {
                if (((chk >> j) & 1)) {
                    chk ^= this.BECH32_GENERATOR[j];
                }
            }
        }
        
        chk = (chk << 5) ^ (chk >> 27);
        for (let j = 0; j < 5; j++) {
            if (((chk >> j) & 1)) {
                chk ^= this.BECH32_GENERATOR[j];
            }
        }
        
        for (let i = 0; i < hrp.length; i++) {
            chk ^= hrp.charCodeAt(i) & 31;
            chk = (chk << 5) ^ (chk >> 27);
            for (let j = 0; j < 5; j++) {
                if (((chk >> j) & 1)) {
                    chk ^= this.BECH32_GENERATOR[j];
                }
            }
        }
        
        for (const value of data) {
            chk ^= value;
            chk = (chk << 5) ^ (chk >> 27);
            for (let j = 0; j < 5; j++) {
                if (((chk >> j) & 1)) {
                    chk ^= this.BECH32_GENERATOR[j];
                }
            }
        }
        
        for (let i = 0; i < 6; i++) {
            chk = (chk << 5) ^ (chk >> 27);
            for (let j = 0; j < 5; j++) {
                if (((chk >> j) & 1)) {
                    chk ^= this.BECH32_GENERATOR[j];
                }
            }
        }
        
        chk ^= 1;
        
        const result = [];
        for (let i = 0; i < 6; i++) {
            result.push((chk >> (5 * (5 - i))) & 31);
        }
        
        return result;
    }

    /**
     * Convert hex to npub format
     */
    static hexToNpub(hex) {
        // Remove any 0x prefix and ensure it's 64 chars
        hex = hex.replace(/^0x/, '').padStart(64, '0');
        
        // Convert hex to bytes
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        
        // Add witness version (0 for npub)
        const data = [0, ...bytes];
        
        // Convert to 5-bit for bech32
        const converted = [];
        let acc = 0;
        let bits = 0;
        
        for (const value of data) {
            acc = (acc << 8) | value;
            bits += 8;
            
            while (bits >= 5) {
                bits -= 5;
                converted.push((acc >>> bits) & 31);
            }
        }
        
        if (bits > 0) {
            converted.push((acc << (5 - bits)) & 31);
        }
        
        // Calculate checksum
        const checksum = this.bech32Checksum('npub', converted);
        const allData = [...converted, ...checksum];
        
        // Encode with bech32 charset
        let result = 'npub1';
        for (const val of allData) {
            result += this.BECH32_CHARSET[val];
        }
        
        return result;
    }

    /**
     * Convert npub to hex format
     */
    static npubToHex(npub) {
        if (npub.startsWith('npub')) {
            try {
                const bytes = this.decodeNpub(npub);
                const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
                return hex.padStart(64, '0');
            } catch (e) {
                throw new Error('Invalid npub format: ' + e.message);
            }
        }
        return npub;
    }

    /**
     * Validate public key format
     */
    static validatePubkey(pubkey) {
        try {
            const hex = this.npubToHex(pubkey);
            return /^[0-9a-fA-F]{64}$/.test(hex);
        } catch (e) {
            return false;
        }
    }

    /**
     * Normalize public key to hex format
     */
    static normalizeKey(key) {
        return this.npubToHex(key);
    }

    /**
     * Decode note1 (event ID) to hex format
     */
    static note1ToHex(note1) {
        if (!note1.startsWith('note1')) {
            throw new Error('Must start with note1');
        }
        
        try {
            // Use same decoding logic as npub but for notes
            const data = note1.slice(5, -6); // Remove 'note1' and checksum
            const decoded = [];
            
            for (let i = 0; i < data.length; i++) {
                const char = data[i];
                const val = this.BECH32_CHARSET.indexOf(char);
                if (val === -1) throw new Error(`Invalid character: ${char}`);
                decoded.push(val);
            }
            
            // Convert from 5-bit to 8-bit
            const converted = [];
            let acc = 0;
            let bits = 0;
            
            for (const value of decoded) {
                acc = (acc << 5) | value;
                bits += 5;
                
                while (bits >= 8) {
                    bits -= 8;
                    converted.push((acc >>> bits) & 0xff);
                }
            }
            
            // Remove witness version byte if present
            if (converted.length > 0 && converted[0] === 0) {
                return converted.slice(1).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            
            return converted.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            throw new Error('Invalid note1 format: ' + e.message);
        }
    }

    /**
     * Convert nostr reference to appropriate format
     */
    static decodeNostrReference(identifier) {
        if (identifier.startsWith('npub1')) {
            return {
                type: 'pubkey',
                hex: this.npubToHex(identifier)
            };
        } else if (identifier.startsWith('note1')) {
            return {
                type: 'eventid',
                hex: this.note1ToHex(identifier)
            };
        } else {
            throw new Error(`Unsupported reference type: ${identifier}`);
        }
    }
}