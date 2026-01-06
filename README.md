# 📊 FollowTracker - Instagram Follower Manager

> Open source Chrome extension to track your Instagram followers, unfollowers, and engagement

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)

## ✨ Features

- ✅ **Track Followers** - See your complete follower list
- 💔 **Detect Unfollows** - Know who unfollowed you
- 🆕 **New Followers** - See who recently followed you
- 👻 **Not Following Back** - Find who you follow but doesn't follow you
- 😎 **You Don't Follow Back** - See who follows you but you don't follow
- 🤝 **Mutual Followers** - View your mutual connections
- 📥 **Export to CSV** - Download all your data
- 🔒 **100% Local** - All data stays on your device
- 🆓 **Completely Free** - No subscriptions, no paywalls

## 🚀 Installation

### Method 1: From Source (Recommended for now)

1. **Download the extension**
   ```bash
   git clone https://github.com/soyMarioPineda/CheeseMe.git
   cd followtracker/extension
   ```

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `extension` folder

3. **You're ready!**
   - Go to Instagram.com
   - Navigate to your profile
   - Click the extension icon
   - Click "Escanear Ahora"

### Method 2: Chrome Web Store (Coming Soon)

Extension will be published to Chrome Web Store soon!

## 📖 How to Use

1. **Go to your Instagram profile**
   - Make sure you're logged in
   - Navigate to your own profile page

2. **Open the extension**
   - Click the FollowTracker icon in your browser toolbar

3. **Scan your followers**
   - Click the "🔍 Escanear Ahora" button
   - Wait 1-2 minutes while it scans
   - The extension will automatically scroll through your followers and following lists

4. **View results**
   - See who unfollowed you
   - Check new followers
   - Find who doesn't follow you back
   - Export data to CSV if needed

## 🔒 Privacy & Security

- **All data stays local** - Your follower data is stored only on your device
- **No external servers** - We don't send your data anywhere
- **Open source** - You can review all the code
- **No tracking** - We don't collect any analytics or personal data

## 🛠️ Technical Stack

- Vanilla JavaScript (no frameworks)
- Chrome Extension Manifest V3
- Local storage only (chrome.storage.local)
- Retro-inspired UI with modern CSS

## 📁 Project Structure

```
extension/
├── manifest.json       # Extension configuration
├── popup.html         # Main UI
├── popup.js           # UI logic
├── scraper.js         # Instagram data extraction
├── style.css          # Retro styling
└── icons/             # Extension icons
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** - Open an issue if you find a bug
2. **Suggest features** - Tell us what you'd like to see
3. **Submit PRs** - Fix bugs or add features
4. **Improve docs** - Help others understand the project
5. **Spread the word** - Star the repo and tell your friends

### Development Setup

```bash
# Clone the repo
git clone https://github.com/soyMarioPineda.git
cd followtracker

# Make your changes in the extension/ folder

# Test in Chrome
# Load unpacked extension from chrome://extensions/

# Submit a PR when ready!
```

## ⚠️ Disclaimer

This extension is not affiliated with, endorsed by, or officially connected with Instagram or Meta. Use at your own risk. The extension works by reading publicly visible data from Instagram's web interface while you're logged in.

**Instagram's Terms of Service:** This extension operates in a gray area. While it only reads data you can already see, automated scraping may violate Instagram's ToS. Use responsibly and at your own discretion.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

This means:
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed
- ❌ No warranty
- ❌ No liability

## 💝 Support the Project

If this extension helped you, consider supporting its development:

**Bitcoin (BTC):**
```
bc1qmjgqu7m997je8xvqm45zpke6tk9c4aus4frvxt
```

**Other ways to help:**
- ⭐ Star this repository
- 🐛 Report bugs and issues
- 💡 Suggest new features
- 📢 Share with friends
- 🤝 Contribute code

## 📞 Contact & Links

- **GitHub Issues:** [Report a bug](https://github.com/soyMarioPineda/CheeseMe/issues)
- **Discussions:** [Join the conversation](https://github.com/soyMarioPineda/CheeseMe/discussions)
- **Email:** your-email@example.com

## 🗺️ Roadmap

- [ ] Publish to Chrome Web Store
- [ ] Add Firefox support
- [ ] Historical graphs and charts
- [ ] Notification system for unfollows
- [ ] Export to JSON/Excel

## 📊 Stats

![GitHub stars](https://img.shields.io/github/stars/soyMarioPineda/CheeseMe?style=social)
![GitHub forks](https://img.shields.io/github/forks/soyMarioPineda/CheeseMe?style=social)
![GitHub issues](https://img.shields.io/github/issues/soyMarioPineda/CheeseMe)

---

Made with ❤️ by the community

**Star this repo if you find it useful!** ⭐