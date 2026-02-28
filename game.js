// Lost "108-Minute Hatch Countdown" Game
// =====================================
// Flip Clock Style Display

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const avatarGif = document.getElementById('avatar-gif');
const avatarGif2 = document.getElementById('avatar-gif2');
const rainSound = document.getElementById('rain-sound');
const themeMusic = document.getElementById('theme-music');
const adminPanel = document.getElementById('admin-panel');
const adminCountdownInput = document.getElementById('admin-countdown');
const adminKeypadInput = document.getElementById('admin-keypad');
const adminSaveBtn = document.getElementById('admin-save');
const adminCancelBtn = document.getElementById('admin-cancel');
let adminPanelOpen = false;

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
// Timer settings (loaded from localStorage or defaults)
const SETTINGS_KEY = 'hatch_settings';
const defaultSettings = { countdownMinutes: 6, keypadMinutes: 4 };
let settings = loadSettings();

function loadSettings() {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return { ...defaultSettings };
        }
    }
    return { ...defaultSettings };
}

function saveSettings(countdownMinutes, keypadMinutes) {
    settings = { countdownMinutes, keypadMinutes };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getTotalTimeMs() {
    return settings.countdownMinutes * 60 * 1000;
}

function getCodeWindowMs() {
    return settings.keypadMinutes * 60 * 1000;
}
const CORRECT_CODE = '4 8 15 16 23 42';
const STORAGE_KEY = 'hatch_endTime';

// States
const State = {
    INTRO: 'INTRO',           // Initial screen with logos, click to start
    SCROLL: 'SCROLL',         // One continuous scroll through everything
    RUNNING: 'RUNNING',
    CODE_WINDOW: 'CODE_WINDOW',
    SUCCESS: 'SUCCESS',
    FAIL: 'FAIL'
};

// Image assets
const images = {
    base: null,
    logo: null,
    logo2: null,
    bottomBg: null
};
let imagesLoaded = 0;
const totalImages = 4;

// Game state
let currentState = State.INTRO;
let endTime = null;
let enteredCode = '';
let debugMode = false;
let flickerPhase = 0;
let flashPhase = 0;

// Intro animation state - one continuous Star Wars style scroll
let scrollOffset = 0;           // Current scroll position
let totalScrollHeight = 0;      // Total scrollable height
let scrollSpeed = 1.0;          // Scroll speed
let autoScrolling = false;      // Whether auto-scroll is active
let scrollStartTime = 0;        // When scroll started (for text timing)

// Story panel positions (calculated after images load)
let storyPanel1Y = 0;           // Y position where story 1 appears in scroll
let storyPanel2Y = 0;           // Y position where story 2 appears in scroll
let bottomBgY = 0;              // Y position where bottom bg starts
const STORY_PANEL_HEIGHT = 600; // Height reserved for each story panel
const STORY_TEXT_AREA = 400;    // Visible area for story text

// Rain effect
let rainDrops = [];
const RAIN_DROP_COUNT = 100;
const RAIN_SPEED_MIN = 400;
const RAIN_SPEED_MAX = 700;
const RAIN_LENGTH_MIN = 15;
const RAIN_LENGTH_MAX = 30;
const RAIN_OPACITY = 0.3;
let lastRainTime = 0;

// Fog effect
let fogLayers = [];
const FOG_LAYER_COUNT = 5;
let lastFogTime = 0;

// DHARMA orientation text (split into two parts for continuous scroll)
function getStoryLinesPart1() {
    return [
        "Welcome to Station 3: The Swan.",
        "",
        "You have been selected for a critical",
        "assignment within the DHARMA Initiative."
    ];
}

function getStoryLinesPart2() {
    return [
        `Every ${settings.countdownMinutes} minutes, you must enter`,
        "the code into the computer.",
        "",
        "4  8  15  16  23  42",
        "",
        "This is your duty. This is your purpose.",
        "Do not fail."
    ];
}

// Button definitions
const startButton = { x: 325, y: 400, width: 150, height: 50 };
const restartButton = { x: 325, y: 450, width: 150, height: 50 };

// Keypad layout (positioned on right side of screen)
const keypadButtons = [];
const keypadStartX = 480;
const keypadStartY = 220;
const keyButtonSize = 55;
const keyButtonGap = 8;

// Flip clock configuration
const TILE_WIDTH = 110;
const TILE_HEIGHT = 150;
const TILE_GAP = 12;
const FLIP_DURATION = 300;

// =====================
// Image Loading
// =====================
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            imagesLoaded++;
            resolve(img);
        };
        img.onerror = () => {
            imagesLoaded++;
            resolve(null); // Continue even if image fails
        };
        img.src = src;
    });
}

async function loadAllImages() {
    images.base = await loadImage('lost-base.png');
    images.logo = await loadImage('lost-logo.png');
    images.logo2 = await loadImage('lost-logo2.png');
    images.bottomBg = await loadImage('lost-bottombg.png');

    // Calculate scroll layout: base image > story1 > story2 > bottom bg
    if (images.base) {
        const baseScale = CANVAS_WIDTH / images.base.width;
        const baseHeight = images.base.height * baseScale;

        // Story panel 1 starts after base image
        storyPanel1Y = baseHeight;

        // Story panel 2 starts after story panel 1
        storyPanel2Y = storyPanel1Y + STORY_PANEL_HEIGHT;

        // Bottom background starts after story panel 2
        bottomBgY = storyPanel2Y + STORY_PANEL_HEIGHT;

        if (images.bottomBg) {
            const bottomScale = CANVAS_WIDTH / images.bottomBg.width;
            const bottomHeight = images.bottomBg.height * bottomScale;
            // Total scroll height
            totalScrollHeight = bottomBgY + bottomHeight - CANVAS_HEIGHT;
        } else {
            totalScrollHeight = bottomBgY;
        }
    }
}

// =====================
// FlipDigit Class
// =====================
class FlipDigit {
    constructor(initialChar = '0') {
        this.currentChar = initialChar;
        this.nextChar = initialChar;
        this.animStart = 0;
        this.animDuration = FLIP_DURATION;
        this.isFlipping = false;
    }

    setChar(newChar) {
        if (newChar !== this.currentChar && !this.isFlipping) {
            this.nextChar = newChar;
            this.animStart = performance.now();
            this.isFlipping = true;
        } else if (newChar !== this.nextChar && this.isFlipping) {
            // Queue the new character
            this.nextChar = newChar;
        } else if (!this.isFlipping) {
            this.currentChar = newChar;
        }
    }

    update() {
        if (!this.isFlipping) return;

        const elapsed = performance.now() - this.animStart;
        if (elapsed >= this.animDuration) {
            this.currentChar = this.nextChar;
            this.isFlipping = false;
        }
    }

    getProgress() {
        if (!this.isFlipping) return 1;
        return Math.min(1, (performance.now() - this.animStart) / this.animDuration);
    }
}

// Create flip digits for MMM:SS (5 digits)
function getInitStr() {
    return String(settings.countdownMinutes).padStart(3, '0') + '00';
}
const initDigits = getInitStr();
const flipDigits = [
    new FlipDigit(initDigits[0]),
    new FlipDigit(initDigits[1]),
    new FlipDigit(initDigits[2]),
    new FlipDigit(initDigits[3]),
    new FlipDigit(initDigits[4])
];

// =====================
// Flip Clock Rendering
// =====================
function drawTileBackground(x, y, width, height) {
    // Main tile background with bevel effect
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#3a3a3a');
    gradient.addColorStop(0.02, '#2d2d2d');
    gradient.addColorStop(0.5, '#252525');
    gradient.addColorStop(0.98, '#1a1a1a');
    gradient.addColorStop(1, '#0f0f0f');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);

    // Outer bevel (light top-left, dark bottom-right)
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();

    ctx.strokeStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.stroke();

    // Horizontal seam line
    const seamY = y + height / 2;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x, seamY - 1.5, width, 3);

    // Subtle highlight above seam
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(x + 2, seamY - 3, width - 4, 2);
}

function drawCharOnTile(char, x, y, width, height, clipTop, clipBottom) {
    ctx.save();

    // Set up clipping region
    ctx.beginPath();
    if (clipTop !== undefined && clipBottom !== undefined) {
        ctx.rect(x, clipTop, width, clipBottom - clipTop);
    } else {
        ctx.rect(x, y, width, height);
    }
    ctx.clip();

    // Draw character
    ctx.fillStyle = '#e8e8e8';
    ctx.font = `bold ${Math.floor(height * 0.75)}px "Arial Black", "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add subtle text shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    ctx.fillText(char, x + width / 2, y + height / 2);

    ctx.restore();
}

function drawFlipDigit(digit, x, y) {
    const w = TILE_WIDTH;
    const h = TILE_HEIGHT;
    const halfH = h / 2;
    const seamY = y + halfH;

    digit.update();
    const t = digit.getProgress();

    // Draw the static background tile
    drawTileBackground(x, y, w, h);

    if (!digit.isFlipping || t >= 1) {
        // No animation - just draw the current character
        drawCharOnTile(digit.currentChar, x, y, w, h, y, y + h);
        return;
    }

    // ===== ANIMATED FLIP =====

    // 1. Draw static top half showing currentChar (until flip completes)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, halfH);
    ctx.clip();
    drawCharOnTile(digit.currentChar, x, y, w, h, y, seamY);
    ctx.restore();

    // 2. Draw static bottom half
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, seamY, w, halfH);
    ctx.clip();
    if (t < 0.5) {
        // Before halfway: bottom shows currentChar
        drawCharOnTile(digit.currentChar, x, y, w, h, seamY, y + h);
    } else {
        // After halfway: bottom shows nextChar
        drawCharOnTile(digit.nextChar, x, y, w, h, seamY, y + h);
    }
    ctx.restore();

    // 3. Draw the animated flap
    if (t < 0.5) {
        // First half: top flap of currentChar rotating downward
        const theta = t * 2 * (Math.PI / 2); // 0 to 90 degrees
        const scaleY = Math.cos(theta);

        if (scaleY > 0.01) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, halfH + 5); // Slight overflow for smooth edge
            ctx.clip();

            ctx.translate(x + w / 2, seamY);
            ctx.scale(1, scaleY);
            ctx.translate(-(x + w / 2), -seamY);

            // Draw flap background
            const flapGradient = ctx.createLinearGradient(x, y, x, seamY);
            flapGradient.addColorStop(0, '#3a3a3a');
            flapGradient.addColorStop(1, '#252525');
            ctx.fillStyle = flapGradient;
            ctx.fillRect(x, y, w, halfH);

            // Draw character on flap
            drawCharOnTile(digit.currentChar, x, y, w, h, y, seamY);

            ctx.restore();

            // Shadow below the folding flap
            const shadowAlpha = t * 0.6;
            ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
            ctx.fillRect(x + 2, seamY, w - 4, halfH * (1 - scaleY) * 0.3 + 5);
        }
    } else {
        // Second half: bottom flap of nextChar rotating from folded to flat
        const theta = (1 - t) * 2 * (Math.PI / 2); // 90 to 0 degrees
        const scaleY = Math.cos(theta);

        if (scaleY > 0.01) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, seamY - 5, w, halfH + 5);
            ctx.clip();

            ctx.translate(x + w / 2, seamY);
            ctx.scale(1, scaleY);
            ctx.translate(-(x + w / 2), -seamY);

            // Draw flap background
            const flapGradient = ctx.createLinearGradient(x, seamY, x, y + h);
            flapGradient.addColorStop(0, '#252525');
            flapGradient.addColorStop(1, '#1a1a1a');
            ctx.fillStyle = flapGradient;
            ctx.fillRect(x, seamY, w, halfH);

            // Draw character on flap
            drawCharOnTile(digit.nextChar, x, y, w, h, seamY, y + h);

            ctx.restore();

            // Shadow on the flap (decreases as it opens)
            const shadowAlpha = (1 - t) * 0.5;
            ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
            ctx.fillRect(x + 2, seamY, w - 4, halfH * scaleY * 0.2 + 3);
        }
    }

    // Redraw seam line on top
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x, seamY - 1, w, 2);
}

function drawColon(x, y) {
    const dotSize = 12;
    const spacing = TILE_HEIGHT * 0.25;

    ctx.fillStyle = '#888';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 3;

    // Top dot
    ctx.beginPath();
    ctx.arc(x, y + TILE_HEIGHT / 2 - spacing, dotSize, 0, Math.PI * 2);
    ctx.fill();

    // Bottom dot
    ctx.beginPath();
    ctx.arc(x, y + TILE_HEIGHT / 2 + spacing, dotSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
}

function drawMetalFrame(x, y, width, height) {
    const frameWidth = 8;

    // Outer frame
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = frameWidth;
    ctx.strokeRect(x - frameWidth / 2, y - frameWidth / 2, width + frameWidth, height + frameWidth);

    // Inner bevel highlight
    ctx.strokeStyle = '#6a6a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - frameWidth, y + height + frameWidth);
    ctx.lineTo(x - frameWidth, y - frameWidth);
    ctx.lineTo(x + width + frameWidth, y - frameWidth);
    ctx.stroke();

    // Inner bevel shadow
    ctx.strokeStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(x + width + frameWidth, y - frameWidth);
    ctx.lineTo(x + width + frameWidth, y + height + frameWidth);
    ctx.lineTo(x - frameWidth, y + height + frameWidth);
    ctx.stroke();
}

function drawCountdown(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const minStr = String(minutes).padStart(3, '0');
    const secStr = String(seconds).padStart(2, '0');
    const timeStr = minStr + secStr;

    // Update flip digits
    for (let i = 0; i < 5; i++) {
        flipDigits[i].setChar(timeStr[i]);
    }

    // Layout calculations
    const colonWidth = 40;
    const minutesWidth = 3 * TILE_WIDTH + 2 * TILE_GAP;
    const secondsWidth = 2 * TILE_WIDTH + TILE_GAP;
    const totalWidth = minutesWidth + colonWidth + secondsWidth;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    const startY = 160;

    // Draw metal frames
    const framePadding = 15;
    drawMetalFrame(
        startX - framePadding,
        startY - framePadding,
        minutesWidth + framePadding * 2,
        TILE_HEIGHT + framePadding * 2
    );
    drawMetalFrame(
        startX + minutesWidth + colonWidth - framePadding,
        startY - framePadding,
        secondsWidth + framePadding * 2,
        TILE_HEIGHT + framePadding * 2
    );

    // Draw minute digits
    for (let i = 0; i < 3; i++) {
        const x = startX + i * (TILE_WIDTH + TILE_GAP);
        drawFlipDigit(flipDigits[i], x, startY);
    }

    // Draw colon
    const colonX = startX + minutesWidth + colonWidth / 2;
    drawColon(colonX, startY);

    // Draw second digits
    for (let i = 0; i < 2; i++) {
        const x = startX + minutesWidth + colonWidth + i * (TILE_WIDTH + TILE_GAP);
        drawFlipDigit(flipDigits[3 + i], x, startY);
    }
}

// Wall-mounted clock for the hatch interior (compact size)
const WALL_TILE_WIDTH = 50;
const WALL_TILE_HEIGHT = 68;
const WALL_TILE_GAP = 5;

function drawWallClock(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const minStr = String(minutes).padStart(3, '0');
    const secStr = String(seconds).padStart(2, '0');
    const timeStr = minStr + secStr;

    // Update flip digits
    for (let i = 0; i < 5; i++) {
        flipDigits[i].setChar(timeStr[i]);
    }

    // Layout calculations for wall clock (compact, tight at top)
    const colonWidth = 16;
    const minutesWidth = 3 * WALL_TILE_WIDTH + 2 * WALL_TILE_GAP;
    const secondsWidth = 2 * WALL_TILE_WIDTH + WALL_TILE_GAP;
    const totalWidth = minutesWidth + colonWidth + secondsWidth;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    const startY = 25;  // Tight at the top

    // Draw clock housing/frame (industrial look)
    const frameX = startX - 12;
    const frameY = startY - 10;
    const frameW = totalWidth + 24;
    const frameH = WALL_TILE_HEIGHT + 20;

    // Outer housing
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(frameX - 5, frameY - 5, frameW + 10, frameH + 10);

    // Inner housing with gradient
    const housingGradient = ctx.createLinearGradient(frameX, frameY, frameX, frameY + frameH);
    housingGradient.addColorStop(0, '#3d3d3d');
    housingGradient.addColorStop(0.5, '#2d2d2d');
    housingGradient.addColorStop(1, '#1d1d1d');
    ctx.fillStyle = housingGradient;
    ctx.fillRect(frameX, frameY, frameW, frameH);

    // Mounting bolts
    ctx.fillStyle = '#555';
    const boltSize = 5;
    ctx.beginPath();
    ctx.arc(frameX + 8, frameY + 8, boltSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(frameX + frameW - 8, frameY + 8, boltSize, 0, Math.PI * 2);
    ctx.fill();

    // Draw minute digits (scaled)
    for (let i = 0; i < 3; i++) {
        const x = startX + i * (WALL_TILE_WIDTH + WALL_TILE_GAP);
        drawWallFlipDigit(flipDigits[i], x, startY);
    }

    // Draw colon
    const colonX = startX + minutesWidth + colonWidth / 2;
    drawWallColon(colonX, startY);

    // Draw second digits
    for (let i = 0; i < 2; i++) {
        const x = startX + minutesWidth + colonWidth + i * (WALL_TILE_WIDTH + WALL_TILE_GAP);
        drawWallFlipDigit(flipDigits[3 + i], x, startY);
    }

    // Add subtle red glow when time is low
    const timeRatio = remainingMs / getTotalTimeMs();
    if (timeRatio < 0.25) {
        const glowIntensity = timeRatio < 0.1 ? 0.4 : 0.2;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 30 * (1 - timeRatio * 4);
        ctx.strokeStyle = `rgba(255, 0, 0, ${glowIntensity})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(frameX - 2, frameY - 2, frameW + 4, frameH + 4);
        ctx.shadowBlur = 0;
    }
}

function drawWallFlipDigit(digit, x, y) {
    const w = WALL_TILE_WIDTH;
    const h = WALL_TILE_HEIGHT;
    const halfH = h / 2;
    const seamY = y + halfH;

    digit.update();
    const t = digit.getProgress();

    // Draw tile background
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, '#3a3a3a');
    gradient.addColorStop(0.02, '#2d2d2d');
    gradient.addColorStop(0.5, '#252525');
    gradient.addColorStop(0.98, '#1a1a1a');
    gradient.addColorStop(1, '#0f0f0f');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);

    // Bevel
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();

    ctx.strokeStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.stroke();

    // Seam line
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x, seamY - 1, w, 2);

    // Draw character
    const char = digit.isFlipping && t >= 0.5 ? digit.nextChar : digit.currentChar;
    ctx.fillStyle = '#e8e8e8';
    ctx.font = `bold ${Math.floor(h * 0.7)}px "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 3;
    ctx.fillText(char, x + w / 2, y + h / 2);
    ctx.shadowBlur = 0;
}

// Terminal prompt on the computer screen
function drawTerminalPrompt() {
    // Position on the computer monitor (top left corner of screen)
    const termX = 310;
    const termY = 210;

    // Green terminal text
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 8;

    // Draw prompt
    ctx.fillText('>:', termX, termY);

    // Blinking cursor (block style like the reference image)
    const cursorBlink = Math.sin(performance.now() / 300) > 0;
    if (cursorBlink) {
        // Draw cursor block after the prompt
        const promptWidth = ctx.measureText('>:').width;
        ctx.fillRect(termX + promptWidth + 5, termY - 15, 12, 20);
    }

    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
}

function drawWallColon(x, y) {
    const dotSize = 5;
    const spacing = WALL_TILE_HEIGHT * 0.22;

    ctx.fillStyle = '#888';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2;

    ctx.beginPath();
    ctx.arc(x, y + WALL_TILE_HEIGHT / 2 - spacing, dotSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y + WALL_TILE_HEIGHT / 2 + spacing, dotSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
}

// =====================
// Screen Effects
// =====================
function drawNoise(alpha = 0.03) {
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imageData.data;
    const noiseAmount = alpha * 255;

    for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel for performance
        const noise = (Math.random() - 0.5) * noiseAmount;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }

    ctx.putImageData(imageData, 0, 0);
}

function drawVignette() {
    const gradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.2,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// =====================
// Rain Effect
// =====================
function initRain() {
    rainDrops = [];
    for (let i = 0; i < RAIN_DROP_COUNT; i++) {
        rainDrops.push(createRainDrop(true));
    }
    lastRainTime = performance.now();
}

function createRainDrop(randomY = false) {
    return {
        x: Math.random() * (CANVAS_WIDTH + 100) - 50,
        y: randomY ? Math.random() * CANVAS_HEIGHT : -RAIN_LENGTH_MAX,
        speed: RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN),
        length: RAIN_LENGTH_MIN + Math.random() * (RAIN_LENGTH_MAX - RAIN_LENGTH_MIN),
        drift: -30 - Math.random() * 20
    };
}

function updateRain() {
    const now = performance.now();
    const dt = (now - lastRainTime) / 1000;
    lastRainTime = now;

    for (let i = 0; i < rainDrops.length; i++) {
        const drop = rainDrops[i];
        drop.y += drop.speed * dt;
        drop.x += drop.drift * dt;

        if (drop.y > CANVAS_HEIGHT + drop.length || drop.x < -50) {
            rainDrops[i] = createRainDrop(false);
        }
    }
}

function renderRain(fadeAmount = 1) {
    if (rainDrops.length === 0) return;

    updateRain();

    ctx.save();
    ctx.strokeStyle = `rgba(180, 200, 220, ${RAIN_OPACITY * fadeAmount})`;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';

    for (const drop of rainDrops) {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 3, drop.y + drop.length);
        ctx.stroke();
    }

    ctx.restore();
}

// =====================
// Smoke Monster Effect
// =====================
let smokeParticles = [];
let smokeMonsterActive = false;
let smokeMonsterX = -200;
let smokeMonsterY = 150;
let smokeMonsterVX = 0;
let smokeMonsterVY = 0;
let smokeMonsterAlpha = 0;
let smokeMonsterTimer = 0;
let smokeMonsterDelay = 500; // Short delay before appearing
let lastSmokeMonsterTime = 0;

function initSmokeMonster() {
    smokeParticles = [];
    smokeMonsterActive = false;
    smokeMonsterX = -200;
    smokeMonsterY = 120;
    smokeMonsterAlpha = 0;
    smokeMonsterTimer = performance.now();
    smokeMonsterDelay = 500;
    lastSmokeMonsterTime = performance.now();
}

function startSmokeMonster() {
    // Immediately activate the smoke monster
    smokeParticles = [];
    smokeMonsterActive = true;
    smokeMonsterX = -200;
    smokeMonsterY = 100 + Math.random() * 80;  // Position above trees
    smokeMonsterVX = 100 + Math.random() * 50;
    smokeMonsterVY = (Math.random() - 0.5) * 15;
    smokeMonsterAlpha = 0.5;  // Start partially visible
    lastSmokeMonsterTime = performance.now();
    smokeMonsterTimer = performance.now();
    smokeMonsterDelay = 2000;  // Delay before next appearance
}

function updateSmokeMonster() {
    const now = performance.now();
    const dt = (now - lastSmokeMonsterTime) / 1000;
    lastSmokeMonsterTime = now;

    // Wait for delay before activating
    if (!smokeMonsterActive) {
        if (now - smokeMonsterTimer > smokeMonsterDelay) {
            smokeMonsterActive = true;
            smokeMonsterX = -200;
            smokeMonsterY = 100 + Math.random() * 80;  // Just above trees
            smokeMonsterVX = 120 + Math.random() * 60;  // Moderate speed
            smokeMonsterVY = (Math.random() - 0.5) * 20;
            smokeMonsterAlpha = 0;
        }
        return;
    }

    // Move smoke monster across screen
    smokeMonsterX += smokeMonsterVX * dt;
    smokeMonsterY += smokeMonsterVY * dt;

    // Wavy vertical movement
    smokeMonsterY += Math.sin(now / 150) * 1.5;

    // Fade in quickly, stay visible, fade out at end
    if (smokeMonsterX < CANVAS_WIDTH * 0.2) {
        smokeMonsterAlpha = Math.min(1, smokeMonsterAlpha + dt * 2);
    } else if (smokeMonsterX > CANVAS_WIDTH * 0.75) {
        smokeMonsterAlpha = Math.max(0, smokeMonsterAlpha - dt * 1.5);
    }

    // Spawn many dark trail particles
    for (let i = 0; i < 8; i++) {
        smokeParticles.push({
            x: smokeMonsterX + Math.random() * 100 - 50,
            y: smokeMonsterY + Math.random() * 60 - 30,
            vx: -40 - Math.random() * 60,
            vy: (Math.random() - 0.5) * 30,
            size: 30 + Math.random() * 70,
            alpha: smokeMonsterAlpha * (0.5 + Math.random() * 0.5),
            decay: 0.2 + Math.random() * 0.2
        });
    }

    // Update particles
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const p = smokeParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += dt * 25;
        p.alpha -= p.decay * dt;

        if (p.alpha <= 0) {
            smokeParticles.splice(i, 1);
        }
    }

    // Reset when off screen
    if (smokeMonsterX > CANVAS_WIDTH + 300) {
        smokeMonsterActive = false;
        smokeMonsterTimer = now;
        smokeMonsterDelay = 2000 + Math.random() * 2000;
        smokeParticles = [];
    }
}

function renderSmokeMonster() {
    if (!smokeMonsterActive && smokeParticles.length === 0) return;

    updateSmokeMonster();

    ctx.save();

    // Draw dark trail particles
    for (const p of smokeParticles) {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${p.alpha})`);
        gradient.addColorStop(0.3, `rgba(5, 5, 10, ${p.alpha * 0.8})`);
        gradient.addColorStop(0.6, `rgba(10, 10, 15, ${p.alpha * 0.4})`);
        gradient.addColorStop(1, `rgba(15, 15, 20, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw main smoke body - large dark mass
    if (smokeMonsterActive && smokeMonsterAlpha > 0) {
        // Core - very dark
        const coreGradient = ctx.createRadialGradient(
            smokeMonsterX, smokeMonsterY, 0,
            smokeMonsterX, smokeMonsterY, 120
        );
        coreGradient.addColorStop(0, `rgba(0, 0, 0, ${smokeMonsterAlpha})`);
        coreGradient.addColorStop(0.4, `rgba(5, 5, 8, ${smokeMonsterAlpha * 0.9})`);
        coreGradient.addColorStop(0.7, `rgba(10, 10, 15, ${smokeMonsterAlpha * 0.5})`);
        coreGradient.addColorStop(1, `rgba(15, 15, 20, 0)`);

        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(smokeMonsterX, smokeMonsterY, 120, 0, Math.PI * 2);
        ctx.fill();

        // Secondary mass for more volume
        const secondGradient = ctx.createRadialGradient(
            smokeMonsterX - 40, smokeMonsterY + 20, 0,
            smokeMonsterX - 40, smokeMonsterY + 20, 80
        );
        secondGradient.addColorStop(0, `rgba(0, 0, 0, ${smokeMonsterAlpha * 0.8})`);
        secondGradient.addColorStop(0.5, `rgba(8, 8, 12, ${smokeMonsterAlpha * 0.5})`);
        secondGradient.addColorStop(1, `rgba(15, 15, 20, 0)`);

        ctx.fillStyle = secondGradient;
        ctx.beginPath();
        ctx.arc(smokeMonsterX - 40, smokeMonsterY + 20, 80, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// =====================
// Fog Effect
// =====================
let fogParticles = [];
const FOG_PARTICLE_COUNT = 40;

function initFog() {
    fogLayers = [];
    fogParticles = [];

    // Create fog particles (soft blobs)
    for (let i = 0; i < FOG_PARTICLE_COUNT; i++) {
        fogParticles.push(createFogParticle());
    }
    lastFogTime = performance.now();
}

function createFogParticle() {
    return {
        x: Math.random() * (CANVAS_WIDTH + 400) - 200,
        y: Math.random() * CANVAS_HEIGHT * 0.8,
        radius: 80 + Math.random() * 150,
        speed: 5 + Math.random() * 15,
        opacity: 0.04 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.2 + Math.random() * 0.3,
        yDrift: (Math.random() - 0.5) * 0.5
    };
}

function updateFog() {
    const now = performance.now();
    const dt = (now - lastFogTime) / 1000;
    lastFogTime = now;

    for (const p of fogParticles) {
        p.x += p.speed * dt;
        p.y += p.yDrift * dt;
        p.phase += p.phaseSpeed * dt;

        // Reset when off screen
        if (p.x > CANVAS_WIDTH + p.radius) {
            p.x = -p.radius;
            p.y = Math.random() * CANVAS_HEIGHT * 0.8;
        }
    }
}

function renderFog(fadeAmount = 1) {
    if (fogParticles.length === 0) return;

    updateFog();

    ctx.save();

    // Draw soft fog blobs using radial gradients
    for (const p of fogParticles) {
        const pulse = 0.6 + 0.4 * Math.sin(p.phase);
        const alpha = p.opacity * fadeAmount * pulse;

        const gradient = ctx.createRadialGradient(
            p.x, p.y, 0,
            p.x, p.y, p.radius
        );
        gradient.addColorStop(0, `rgba(175, 190, 205, ${alpha})`);
        gradient.addColorStop(0.4, `rgba(170, 185, 200, ${alpha * 0.6})`);
        gradient.addColorStop(0.7, `rgba(165, 180, 195, ${alpha * 0.3})`);
        gradient.addColorStop(1, `rgba(160, 175, 190, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Add overall atmospheric haze
    const hazeGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    hazeGradient.addColorStop(0, `rgba(170, 185, 200, ${0.12 * fadeAmount})`);
    hazeGradient.addColorStop(0.5, `rgba(170, 185, 200, ${0.06 * fadeAmount})`);
    hazeGradient.addColorStop(1, `rgba(170, 185, 200, 0)`);
    ctx.fillStyle = hazeGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.restore();
}

// =====================
// Keypad
// =====================
function initKeypad() {
    const layout = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['C', '0', 'E']
    ];

    keypadButtons.length = 0;
    for (let row = 0; row < layout.length; row++) {
        for (let col = 0; col < layout[row].length; col++) {
            keypadButtons.push({
                label: layout[row][col],
                x: keypadStartX + col * (keyButtonSize + keyButtonGap),
                y: keypadStartY + row * (keyButtonSize + keyButtonGap),
                width: keyButtonSize,
                height: keyButtonSize
            });
        }
    }
}

// =====================
// State Renderers
// =====================
function renderLoading() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#666';
    ctx.font = '24px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOADING...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    // Loading bar
    const barWidth = 200;
    const barHeight = 10;
    const barX = (CANVAS_WIDTH - barWidth) / 2;
    const barY = CANVAS_HEIGHT / 2 + 30;
    const progress = imagesLoaded / totalImages;

    ctx.strokeStyle = '#444';
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);
}

function renderIntro() {
    // Draw the top portion of the background image
    if (images.base) {
        // Scale image to fit canvas width while maintaining aspect ratio
        const scale = CANVAS_WIDTH / images.base.width;
        const scaledHeight = images.base.height * scale;

        // Draw from the top of the image (scrollOffset = 0 initially)
        ctx.drawImage(
            images.base,
            0, scrollOffset / scale, images.base.width, CANVAS_HEIGHT / scale,
            0, 0, CANVAS_WIDTH, CANVAS_HEIGHT
        );
    } else {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Render smoke monster (in sky area)
    renderSmokeMonster();

    // Draw DHARMA logo at top center
    if (images.logo) {
        const logoScale = 0.6;
        const logoWidth = images.logo.width * logoScale;
        const logoHeight = images.logo.height * logoScale;
        const logoX = (CANVAS_WIDTH - logoWidth) / 2;
        const logoY = 60;
        ctx.drawImage(images.logo, logoX, logoY, logoWidth, logoHeight);
    }

    // Draw "The Swan" text below logo
    if (images.logo2) {
        const logo2Scale = 0.35;
        const logo2Width = images.logo2.width * logo2Scale;
        const logo2Height = images.logo2.height * logo2Scale;
        const logo2X = (CANVAS_WIDTH - logo2Width) / 2;
        const logo2Y = 220;
        ctx.drawImage(images.logo2, logo2X, logo2Y, logo2Width, logo2Height);
    }

    // Render fog and rain effects
    renderFog(1);
    renderRain(1);

    // Pulsing "Click to continue" text
    flickerPhase += 0.03;
    const alpha = 0.5 + Math.sin(flickerPhase) * 0.3;
    ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    ctx.font = '18px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[ Click to continue ]', CANVAS_WIDTH / 2, 520);

    // Debug instructions (subtle)
    ctx.fillStyle = '#333';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('A = admin | D = debug | R = reset', CANVAS_WIDTH / 2, 580);

    drawVignette();
}

function renderScroll() {
    // Continuous auto-scroll with variable speed
    if (autoScrolling && scrollOffset < totalScrollHeight) {
        // Slow down during story panels (GIF sections)
        let currentSpeed = scrollSpeed;
        if (scrollOffset >= storyPanel1Y - 100 && scrollOffset < bottomBgY) {
            currentSpeed = scrollSpeed * 0.5;  // Half speed during story panels
        }
        scrollOffset += currentSpeed;
    }

    // Draw the scrolling backgrounds and story panels
    drawScrollingContent();

    // Render smoke monster in sky (visible during outdoor scroll)
    if (scrollOffset < storyPanel1Y - 100) {
        renderSmokeMonster();
    }

    // Fade out logos as we scroll
    const logoFade = Math.max(0, 1 - scrollOffset / 200);
    if (logoFade > 0) {
        ctx.globalAlpha = logoFade;

        if (images.logo) {
            const logoScale = 0.6;
            const logoWidth = images.logo.width * logoScale;
            const logoHeight = images.logo.height * logoScale;
            const logoX = (CANVAS_WIDTH - logoWidth) / 2;
            const logoY = 60 - scrollOffset * 0.5;
            ctx.drawImage(images.logo, logoX, logoY, logoWidth, logoHeight);
        }

        if (images.logo2) {
            const logo2Scale = 0.35;
            const logo2Width = images.logo2.width * logo2Scale;
            const logo2Height = images.logo2.height * logo2Scale;
            const logo2X = (CANVAS_WIDTH - logo2Width) / 2;
            const logo2Y = 220 - scrollOffset * 0.5;
            ctx.drawImage(images.logo2, logo2X, logo2Y, logo2Width, logo2Height);
        }

        ctx.globalAlpha = 1;
    }

    // Render fog (fades before story panels)
    const fogFadePoint = storyPanel1Y * 0.8;
    const fogFade = Math.max(0, 1 - (scrollOffset / fogFadePoint));
    if (fogFade > 0) {
        renderFog(fogFade);
    }

    // Render rain (stops well before the first GIF/text appears)
    const rainFadeStart = storyPanel1Y - 600;  // Start fading earlier
    const rainFadeEnd = storyPanel1Y - 300;  // Fully faded 1.5s sooner
    let rainFade = 1;
    if (scrollOffset > rainFadeStart) {
        rainFade = Math.max(0, 1 - (scrollOffset - rainFadeStart) / (rainFadeEnd - rainFadeStart));
    }
    if (rainFade > 0) {
        renderRain(rainFade);
    }

    // Handle avatar visibility based on scroll position
    updateAvatarsForScroll();

    drawVignette();

    // Transition to game when scroll is complete
    if (scrollOffset >= totalScrollHeight) {
        scrollOffset = totalScrollHeight;
        startGame();
    }
}

function drawScrollingContent() {
    // Layout: base image -> story panel 1 -> story panel 2 -> bottom bg

    if (images.base) {
        const scale = CANVAS_WIDTH / images.base.width;
        const baseHeight = images.base.height * scale;

        // Draw base image scrolling up
        const baseY = -scrollOffset;
        if (baseY + baseHeight > 0 && baseY < CANVAS_HEIGHT) {
            ctx.drawImage(
                images.base,
                0, 0, images.base.width, images.base.height,
                0, baseY, CANVAS_WIDTH, baseHeight
            );
        }

        // Draw story panel 1 (black background with text)
        const panel1Y = storyPanel1Y - scrollOffset;
        if (panel1Y < CANVAS_HEIGHT && panel1Y + STORY_PANEL_HEIGHT > 0) {
            drawStoryPanel1(panel1Y);
        }

        // Draw story panel 2 (black background with text)
        const panel2Y = storyPanel2Y - scrollOffset;
        if (panel2Y < CANVAS_HEIGHT && panel2Y + STORY_PANEL_HEIGHT > 0) {
            drawStoryPanel2(panel2Y);
        }

        // Draw bottom background
        if (images.bottomBg) {
            const bottomScale = CANVAS_WIDTH / images.bottomBg.width;
            const bottomHeight = images.bottomBg.height * bottomScale;
            const bottomY = bottomBgY - scrollOffset;

            if (bottomY < CANVAS_HEIGHT && bottomY + bottomHeight > 0) {
                ctx.drawImage(
                    images.bottomBg,
                    0, 0, images.bottomBg.width, images.bottomBg.height,
                    0, bottomY, CANVAS_WIDTH, bottomHeight
                );
            }
        }
    }
}

function drawStoryPanel1(y) {
    // Black background for story panel
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, CANVAS_WIDTH, STORY_PANEL_HEIGHT);

    // Draw story text (full visibility, no fade)
    const storyLines = getStoryLinesPart1();
    ctx.font = '20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ccc';

    let lineY = y + 200;
    for (const line of storyLines) {
        ctx.fillText(line, 500, lineY);
        lineY += 32;
    }
}

function drawStoryPanel2(y) {
    // Black background for story panel
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, CANVAS_WIDTH, STORY_PANEL_HEIGHT);

    // Draw story text (full visibility, no fade)
    const storyLines = getStoryLinesPart2();
    ctx.textAlign = 'center';

    let lineY = y + 180;
    for (const line of storyLines) {
        if (line.includes('4  8  15')) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 24px "Courier New", monospace';
        } else {
            ctx.fillStyle = '#ccc';
            ctx.font = '20px "Courier New", monospace';
        }
        ctx.fillText(line, 500, lineY);
        lineY += 32;
    }
}

function updateAvatarsForScroll() {
    // Calculate panel positions relative to screen
    const panel1Y = storyPanel1Y - scrollOffset;
    const panel2Y = storyPanel2Y - scrollOffset;

    // Avatar offset within panel (positioned near top of panel content)
    const avatarOffsetInPanel = 150;

    // Calculate avatar positions - they scroll with their panels
    const avatar1Top = panel1Y + avatarOffsetInPanel;
    const avatar2Top = panel2Y + avatarOffsetInPanel;

    // Panel is visible when any part is on screen
    const panel1Visible = panel1Y < CANVAS_HEIGHT && panel1Y + STORY_PANEL_HEIGHT > 0;
    const panel2Visible = panel2Y < CANVAS_HEIGHT && panel2Y + STORY_PANEL_HEIGHT > 0;

    // Avatar is visible when it's within screen bounds (with some padding)
    const avatar1OnScreen = avatar1Top > -200 && avatar1Top < CANVAS_HEIGHT;
    const avatar2OnScreen = avatar2Top > -200 && avatar2Top < CANVAS_HEIGHT;

    // Show avatar 1 - scrolls with panel 1 until it exits top of screen
    if (avatar1OnScreen) {
        const avatarAlpha = Math.min(1, Math.max(0,
            Math.min((avatar1Top + 200) / 150, (CANVAS_HEIGHT - avatar1Top) / 150)
        ));
        if (avatarGif) {
            avatarGif.style.display = 'block';
            avatarGif.style.opacity = avatarAlpha;
            avatarGif.style.top = avatar1Top + 'px';
        }
    } else {
        if (avatarGif) {
            avatarGif.style.display = 'none';
        }
    }

    // Show avatar 2 - scrolls with panel 2 until it exits top of screen
    if (avatar2OnScreen) {
        const avatarAlpha = Math.min(1, Math.max(0,
            Math.min((avatar2Top + 200) / 150, (CANVAS_HEIGHT - avatar2Top) / 150)
        ));
        if (avatarGif2) {
            avatarGif2.style.display = 'block';
            avatarGif2.style.opacity = avatarAlpha;
            avatarGif2.style.top = avatar2Top + 'px';
        }
    } else {
        if (avatarGif2) {
            avatarGif2.style.display = 'none';
        }
    }

    // Start theme music when entering story panels, fade rain
    if ((panel1Visible || panel2Visible) && rainSound && !rainSound.paused) {
        fadeOutRainSound();
        playThemeMusic();
    }
}


function renderRunning(remainingMs) {
    // Draw the hatch interior background
    if (images.bottomBg) {
        const scale = CANVAS_WIDTH / images.bottomBg.width;
        const height = images.bottomBg.height * scale;
        ctx.drawImage(images.bottomBg, 0, 0, CANVAS_WIDTH, height);
    } else {
        ctx.fillStyle = '#0c0c0c';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Draw terminal prompt on computer screen
    drawTerminalPrompt();

    // Draw the flip clock countdown on the wall (above computer)
    drawWallClock(remainingMs);

    drawVignette();
    drawNoise(0.015);
}

function renderCodeWindow(remainingMs) {
    // Draw the hatch interior background
    if (images.bottomBg) {
        const scale = CANVAS_WIDTH / images.bottomBg.width;
        const height = images.bottomBg.height * scale;
        ctx.drawImage(images.bottomBg, 0, 0, CANVAS_WIDTH, height);
    } else {
        ctx.fillStyle = '#0a0505';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Draw wall clock (will show urgency with red glow)
    drawWallClock(remainingMs);

    // Flashing warning border
    flickerPhase += 0.15;
    const borderAlpha = 0.3 + Math.sin(flickerPhase) * 0.2;
    ctx.strokeStyle = `rgba(200, 50, 50, ${borderAlpha})`;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, CANVAS_WIDTH - 6, CANVAS_HEIGHT - 6);

    // Terminal overlay area (semi-transparent to see background)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(30, 200, 380, 180);
    ctx.strokeStyle = '#aa3333';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 200, 380, 180);

    // Warning text
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 22px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ENTER THE NUMBERS', 220, 230);

    // Code display area
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(45, 250, 350, 50);
    ctx.strokeStyle = '#00aa00';
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 250, 350, 50);

    // Entered code
    ctx.fillStyle = '#00dd00';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(enteredCode || '_', 55, 285);
    ctx.textAlign = 'center';

    // Instructions
    ctx.fillStyle = '#555';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('Type numbers or use keypad | Enter = submit', 220, 365);

    // Keypad (repositioned)
    for (const btn of keypadButtons) {
        ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
        ctx.fillRect(btn.x, btn.y, btn.width, btn.height);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

        let label = btn.label;
        let color = '#aaa';
        if (btn.label === 'C') {
            label = 'CLR';
            color = '#ff6600';
        } else if (btn.label === 'E') {
            label = 'EXE';
            color = '#00cc00';
        }

        ctx.fillStyle = color;
        ctx.font = 'bold 18px "Courier New", monospace';
        ctx.fillText(label, btn.x + btn.width / 2, btn.y + btn.height / 2 + 6);
    }

    drawVignette();
    drawNoise(0.02);
}

function renderSuccess() {
    // Draw the hatch interior background
    if (images.bottomBg) {
        const scale = CANVAS_WIDTH / images.bottomBg.width;
        const height = images.bottomBg.height * scale;
        ctx.drawImage(images.bottomBg, 0, 0, CANVAS_WIDTH, height);
    } else {
        ctx.fillStyle = '#001a00';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Success glow overlay
    const gradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 400
    );
    gradient.addColorStop(0, 'rgba(0, 80, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Success message box
    ctx.fillStyle = 'rgba(0, 30, 0, 0.85)';
    ctx.fillRect(150, 200, 500, 200);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 3;
    ctx.strokeRect(150, 200, 500, 200);

    // Success text
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 48px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 20;
    ctx.fillText('SYSTEM RESET', CANVAS_WIDTH / 2, 270);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#00cc00';
    ctx.font = '26px "Arial", sans-serif';
    ctx.fillText('COUNTDOWN AVERTED', CANVAS_WIDTH / 2, 320);

    ctx.fillStyle = '#008800';
    ctx.font = '20px "Arial", sans-serif';
    const restoredTime = String(settings.countdownMinutes).padStart(3, '0') + ':00';
    ctx.fillText(restoredTime + ' RESTORED', CANVAS_WIDTH / 2, 360);

    // Restart button
    ctx.fillStyle = '#003300';
    ctx.fillRect(restartButton.x, restartButton.y, restartButton.width, restartButton.height);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 2;
    ctx.strokeRect(restartButton.x, restartButton.y, restartButton.width, restartButton.height);

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('RESTART', CANVAS_WIDTH / 2, restartButton.y + 32);

    drawVignette();
}

function renderFail() {
    // Draw the hatch interior background
    if (images.bottomBg) {
        const scale = CANVAS_WIDTH / images.bottomBg.width;
        const height = images.bottomBg.height * scale;
        ctx.drawImage(images.bottomBg, 0, 0, CANVAS_WIDTH, height);
    }

    // Flashing red overlay
    flashPhase += 0.2;
    const flash = Math.sin(flashPhase) > 0;

    // Red emergency overlay
    ctx.fillStyle = flash ? 'rgba(60, 0, 0, 0.7)' : 'rgba(20, 0, 0, 0.6)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Flashing warning border
    ctx.strokeStyle = flash ? '#ff0000' : '#660000';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8);

    // Failure message box
    ctx.fillStyle = flash ? 'rgba(50, 0, 0, 0.9)' : 'rgba(30, 0, 0, 0.9)';
    ctx.fillRect(100, 180, 600, 220);
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = 3;
    ctx.strokeRect(100, 180, 600, 220);

    // Failure text
    ctx.fillStyle = flash ? '#ff0000' : '#880000';
    ctx.font = 'bold 56px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = flash ? 40 : 15;
    ctx.fillText('SYSTEM FAILURE', CANVAS_WIDTH / 2, 260);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff4444';
    ctx.font = '24px "Arial", sans-serif';
    ctx.fillText('PROTOCOL NOT EXECUTED', CANVAS_WIDTH / 2, 310);

    ctx.fillStyle = '#aa3333';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('THE NUMBERS WERE NOT ENTERED IN TIME', CANVAS_WIDTH / 2, 355);

    // Restart button
    ctx.fillStyle = '#330000';
    ctx.fillRect(restartButton.x, restartButton.y, restartButton.width, restartButton.height);
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(restartButton.x, restartButton.y, restartButton.width, restartButton.height);

    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('RESTART', CANVAS_WIDTH / 2, restartButton.y + 32);

    drawVignette();
}

function renderDebug(remainingMs) {
    if (!debugMode) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(10, 10, 280, 120);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 280, 120);

    ctx.fillStyle = '#00ff00';
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`State: ${currentState}`, 20, 35);
    ctx.fillText(`endTime: ${endTime}`, 20, 55);
    ctx.fillText(`remainingMs: ${Math.round(remainingMs)}`, 20, 75);
    ctx.fillText(`Flipping: ${flipDigits.map(d => d.isFlipping ? '1' : '0').join('')}`, 20, 95);
    ctx.fillText(`Digits: ${flipDigits.map(d => d.currentChar).join('')}`, 20, 115);
    ctx.textAlign = 'center';
}

// =====================
// Game Logic
// =====================
function update() {
    if (currentState === State.INTRO || currentState === State.SCROLL ||
        currentState === State.SUCCESS || currentState === State.FAIL) {
        return 0;
    }

    const remainingMs = endTime - Date.now();

    if (remainingMs <= 0) {
        currentState = State.FAIL;
        return 0;
    }

    if (currentState === State.RUNNING && remainingMs <= getCodeWindowMs()) {
        currentState = State.CODE_WINDOW;
    }

    return remainingMs;
}

function render() {
    const remainingMs = update();

    // Show loading screen until images are ready
    if (imagesLoaded < totalImages) {
        renderLoading();
        renderDebug(remainingMs);
        return;
    }

    switch (currentState) {
        case State.INTRO:
            renderIntro();
            break;
        case State.SCROLL:
            renderScroll();
            break;
        case State.RUNNING:
            renderRunning(remainingMs);
            break;
        case State.CODE_WINDOW:
            renderCodeWindow(remainingMs);
            break;
        case State.SUCCESS:
            renderSuccess();
            break;
        case State.FAIL:
            renderFail();
            break;
    }

    renderDebug(remainingMs);
}

function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
}

// =====================
// Event Handlers
// =====================
function handleClick(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (currentState === State.INTRO) {
        // Start rain sound on first click (browsers require user interaction for audio)
        playRainSound();
        // Click anywhere to start continuous scroll
        currentState = State.SCROLL;
        autoScrolling = true;
        scrollStartTime = Date.now();
        // Start smoke monster immediately when scroll begins
        startSmokeMonster();
    } else if (currentState === State.SCROLL) {
        // Click to speed up scroll temporarily
        scrollSpeed = Math.min(scrollSpeed + 0.8, 4);
        // Reset speed after a moment
        setTimeout(() => {
            scrollSpeed = 1.0;
        }, 500);
    } else if (currentState === State.CODE_WINDOW) {
        for (const btn of keypadButtons) {
            if (isInside(x, y, btn)) {
                handleKeypadInput(btn.label);
                break;
            }
        }
    } else if (currentState === State.SUCCESS || currentState === State.FAIL) {
        if (isInside(x, y, restartButton)) {
            resetGame();
        }
    }
}

function toggleAdminPanel() {
    adminPanelOpen = !adminPanelOpen;
    if (adminPanelOpen) {
        adminCountdownInput.value = settings.countdownMinutes;
        adminKeypadInput.value = settings.keypadMinutes;
        adminPanel.style.display = 'block';
    } else {
        adminPanel.style.display = 'none';
    }
}

function handleAdminSave() {
    const countdown = parseInt(adminCountdownInput.value, 10) || 6;
    const keypad = parseInt(adminKeypadInput.value, 10) || 4;

    // Validate: keypad must be less than countdown
    if (keypad >= countdown) {
        alert('Keypad window must be less than countdown time!');
        return;
    }

    saveSettings(countdown, keypad);
    toggleAdminPanel();
    resetGame();
}

function handleAdminCancel() {
    toggleAdminPanel();
}

function handleKeydown(event) {
    // Ignore keys when admin panel is open (except Escape)
    if (adminPanelOpen) {
        if (event.key === 'Escape' || event.key === 'a' || event.key === 'A') {
            toggleAdminPanel();
        }
        return;
    }

    if (event.key === 'a' || event.key === 'A') {
        toggleAdminPanel();
        return;
    }

    if (event.key === 'd' || event.key === 'D') {
        debugMode = !debugMode;
        return;
    }

    if (event.key === 'r' || event.key === 'R') {
        resetGame();
        return;
    }

    // Spacebar acts as click to continue (except in CODE_WINDOW where it adds spaces)
    if (event.key === ' ' && currentState !== State.CODE_WINDOW) {
        event.preventDefault();
        // Simulate a click in the center of the canvas
        handleClick({ clientX: canvas.offsetLeft + CANVAS_WIDTH / 2, clientY: canvas.offsetTop + CANVAS_HEIGHT / 2 });
        return;
    }

    if (currentState === State.CODE_WINDOW) {
        if (event.key >= '0' && event.key <= '9') {
            handleKeypadInput(event.key);
        } else if (event.key === 'Enter') {
            handleKeypadInput('E');
        } else if (event.key === 'Backspace') {
            enteredCode = enteredCode.slice(0, -1).trim();
        } else if (event.key === ' ') {
            if (enteredCode.length > 0 && !enteredCode.endsWith(' ')) {
                enteredCode += ' ';
            }
        }
    }
}

function handleKeypadInput(key) {
    if (key === 'C') {
        enteredCode = '';
    } else if (key === 'E') {
        checkCode();
    } else {
        if (enteredCode.length > 0 && !enteredCode.endsWith(' ')) {
            const lastNum = enteredCode.split(' ').pop();
            if (lastNum.length >= 2) {
                enteredCode += ' ';
            }
        }
        enteredCode += key;
    }
}

function checkCode() {
    const normalizedEntry = enteredCode.trim().replace(/\s+/g, ' ');
    if (normalizedEntry === CORRECT_CODE) {
        currentState = State.SUCCESS;
        localStorage.removeItem(STORAGE_KEY);
    } else {
        enteredCode = '';
    }
}

function isInside(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width &&
           y >= rect.y && y <= rect.y + rect.height;
}

function hideAvatarGif() {
    if (avatarGif) {
        avatarGif.style.display = 'none';
        avatarGif.style.opacity = 0;
    }
    if (avatarGif2) {
        avatarGif2.style.display = 'none';
        avatarGif2.style.opacity = 0;
    }
}

// Audio control functions
function playRainSound() {
    if (rainSound) {
        rainSound.volume = 0.5;
        rainSound.play().catch(() => {});  // Ignore autoplay errors
    }
}

function stopRainSound() {
    if (rainSound) {
        rainSound.pause();
        rainSound.currentTime = 0;
    }
}

function fadeOutRainSound() {
    if (rainSound && !rainSound.paused) {
        let vol = rainSound.volume;
        const fadeInterval = setInterval(() => {
            vol -= 0.05;
            if (vol <= 0) {
                rainSound.volume = 0;
                rainSound.pause();
                rainSound.currentTime = 0;
                clearInterval(fadeInterval);
            } else {
                rainSound.volume = vol;
            }
        }, 100);
    }
}

function playThemeMusic() {
    if (themeMusic) {
        themeMusic.volume = 0.4;
        themeMusic.play().catch(() => {});
    }
}

function stopThemeMusic() {
    if (themeMusic) {
        themeMusic.pause();
        themeMusic.currentTime = 0;
    }
}

function stopAllAudio() {
    stopRainSound();
    stopThemeMusic();
}

function startGame() {
    hideAvatarGif();
    endTime = Date.now() + getTotalTimeMs();
    localStorage.setItem(STORAGE_KEY, endTime.toString());
    currentState = State.RUNNING;
    enteredCode = '';

    // Reset flip digits to initial state
    const initStr = getInitStr();
    for (let i = 0; i < 5; i++) {
        flipDigits[i] = new FlipDigit(initStr[i]);
    }
}

function resetGame() {
    hideAvatarGif();
    stopAllAudio();
    localStorage.removeItem(STORAGE_KEY);
    endTime = null;
    currentState = State.INTRO;
    enteredCode = '';
    flickerPhase = 0;
    flashPhase = 0;

    // Reset continuous scroll state
    scrollOffset = 0;
    scrollSpeed = 1.0;
    autoScrolling = false;
    scrollStartTime = 0;

    // Reinitialize rain, fog, and smoke monster
    initRain();
    initFog();
    initSmokeMonster();

    // Reset flip digits
    const initStr = getInitStr();
    for (let i = 0; i < 5; i++) {
        flipDigits[i] = new FlipDigit(initStr[i]);
    }
}

function init() {
    initKeypad();
    hideAvatarGif();
    initRain();
    initFog();
    initSmokeMonster();

    // Load images first
    loadAllImages();

    // Check for existing countdown
    const storedEndTime = localStorage.getItem(STORAGE_KEY);
    if (storedEndTime) {
        endTime = parseInt(storedEndTime, 10);
        const remainingMs = endTime - Date.now();

        if (remainingMs > 0) {
            // Initialize flip digits to current time
            const totalSeconds = Math.ceil(remainingMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const timeStr = String(minutes).padStart(3, '0') + String(seconds).padStart(2, '0');

            for (let i = 0; i < 5; i++) {
                flipDigits[i] = new FlipDigit(timeStr[i]);
            }

            if (remainingMs <= getCodeWindowMs()) {
                currentState = State.CODE_WINDOW;
            } else {
                currentState = State.RUNNING;
            }
        } else {
            currentState = State.FAIL;
        }
    } else {
        // No existing countdown - start with intro
        currentState = State.INTRO;
    }

    canvas.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);

    // Admin panel buttons
    if (adminSaveBtn) adminSaveBtn.addEventListener('click', handleAdminSave);
    if (adminCancelBtn) adminCancelBtn.addEventListener('click', handleAdminCancel);

    gameLoop();
}

// Start the game
init();
