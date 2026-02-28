// Lost "108-Minute Hatch Countdown" Game
// =====================================
// Flip Clock Style Display

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const avatarGif = document.getElementById('avatar-gif');
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
    INTRO: 'INTRO',           // Initial screen with logos
    SCROLL: 'SCROLL',         // Background scrolling down
    STORY: 'STORY',           // Avatar and story text
    RUNNING: 'RUNNING',
    CODE_WINDOW: 'CODE_WINDOW',
    SUCCESS: 'SUCCESS',
    FAIL: 'FAIL'
};

// Image assets
const images = {
    base: null,
    logo: null,
    logo2: null
};
let imagesLoaded = 0;
const totalImages = 3;

// Game state
let currentState = State.INTRO;
let endTime = null;
let enteredCode = '';
let debugMode = false;
let flickerPhase = 0;
let flashPhase = 0;

// Intro animation state
let scrollOffset = 0;           // How much the background has scrolled
let scrollTarget = 0;           // Target scroll position
let scrollSpeed = 2;            // Pixels per frame
let storyAlpha = 0;             // Fade in alpha for story
let storyTextIndex = 0;         // Current character being typed
let storyStartTime = 0;         // When story started
let storyComplete = false;      // Story finished displaying

// Rain effect
let rainDrops = [];
const RAIN_DROP_COUNT = 100;
const RAIN_SPEED_MIN = 400;
const RAIN_SPEED_MAX = 700;
const RAIN_LENGTH_MIN = 15;
const RAIN_LENGTH_MAX = 30;
const RAIN_OPACITY = 0.3;
let lastRainTime = 0;

// DHARMA orientation text (dynamic based on settings)
function getStoryLines() {
    return [
        "Welcome to Station 3: The Swan.",
        "",
        `Every ${settings.countdownMinutes} minutes, you must enter`,
        "the code into the computer.",
        "",
        "4  8  15  16  23  42",
        "",
        "This is your duty. This is your purpose.",
        "Do not fail.",
        "",
        "[Click to begin your shift]"
    ];
}

// Button definitions
const startButton = { x: 325, y: 400, width: 150, height: 50 };
const restartButton = { x: 325, y: 450, width: 150, height: 50 };

// Keypad layout
const keypadButtons = [];
const keypadStartX = 500;
const keypadStartY = 200;
const keyButtonSize = 60;
const keyButtonGap = 10;

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

    // Calculate scroll target based on image height
    if (images.base) {
        // We want to scroll to show the hatch at bottom
        // The canvas is 600px, the image is taller
        scrollTarget = images.base.height - CANVAS_HEIGHT;
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

    // Render rain effect
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
    // Animate scroll
    if (scrollOffset < scrollTarget) {
        scrollOffset += scrollSpeed;
        // Ease out as we approach target
        if (scrollTarget - scrollOffset < 100) {
            scrollSpeed = Math.max(1, scrollSpeed * 0.95);
        }
    }

    if (images.base) {
        const scale = CANVAS_WIDTH / images.base.width;

        // Clamp scroll offset
        const maxScroll = images.base.height * scale - CANVAS_HEIGHT;
        const clampedOffset = Math.min(scrollOffset, maxScroll);

        ctx.drawImage(
            images.base,
            0, clampedOffset / scale, images.base.width, CANVAS_HEIGHT / scale,
            0, 0, CANVAS_WIDTH, CANVAS_HEIGHT
        );
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

    // Render rain with fade as we scroll (outdoor to indoor transition)
    const rainFade = Math.max(0, 1 - (scrollOffset / (scrollTarget * 0.75)));
    if (rainFade > 0) {
        renderRain(rainFade);
    }

    drawVignette();

    // Check if scroll is complete
    if (scrollOffset >= scrollTarget - 10) {
        scrollOffset = scrollTarget;
        currentState = State.STORY;
        storyStartTime = Date.now();
        storyTextIndex = 0;
        storyAlpha = 0;
    }
}

function renderStory() {
    // Draw background at final scroll position
    if (images.base) {
        const scale = CANVAS_WIDTH / images.base.width;
        const maxScroll = images.base.height * scale - CANVAS_HEIGHT;

        ctx.drawImage(
            images.base,
            0, maxScroll / scale, images.base.width, CANVAS_HEIGHT / scale,
            0, 0, CANVAS_WIDTH, CANVAS_HEIGHT
        );
    }

    // Fade in story overlay
    if (storyAlpha < 0.85) {
        storyAlpha += 0.01;
    }

    // Semi-transparent overlay for readability
    ctx.fillStyle = `rgba(0, 0, 0, ${storyAlpha * 0.7})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Show the animated GIF avatar (full image, no clipping)
    if (avatarGif) {
        avatarGif.style.display = 'block';
        avatarGif.style.opacity = Math.min(1, storyAlpha * 1.5);
    }

    // Typewriter effect for story text
    const elapsed = Date.now() - storyStartTime;
    const charsPerSecond = 30;
    const totalChars = getStoryLines().join('\n').length;
    storyTextIndex = Math.min(totalChars, Math.floor(elapsed * charsPerSecond / 1000));

    // Draw story text with typewriter effect
    ctx.globalAlpha = storyAlpha;
    ctx.font = '18px "Courier New", monospace';
    ctx.textAlign = 'left';

    let charCount = 0;
    let lineY = 200;
    const textX = 280;

    for (const line of getStoryLines()) {
        if (charCount >= storyTextIndex) break;

        const charsToShow = Math.min(line.length, storyTextIndex - charCount);
        const displayText = line.substring(0, charsToShow);

        // Special formatting for the numbers line
        if (line.includes('4  8  15')) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 20px "Courier New", monospace';
        } else if (line.includes('[Click')) {
            ctx.fillStyle = '#888';
            ctx.font = 'italic 16px "Courier New", monospace';
        } else {
            ctx.fillStyle = '#ccc';
            ctx.font = '18px "Courier New", monospace';
        }

        ctx.fillText(displayText, textX, lineY);

        charCount += line.length + 1; // +1 for newline
        lineY += 28;
    }

    ctx.globalAlpha = 1;

    // Check if story is complete
    if (storyTextIndex >= totalChars) {
        storyComplete = true;
    }

    drawVignette();
}

function renderRunning(remainingMs) {
    // Dark background
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Warning header
    const timeRatio = remainingMs / getTotalTimeMs();
    let headerColor = '#666';
    if (timeRatio < 0.1) headerColor = '#aa4444';
    else if (timeRatio < 0.25) headerColor = '#886644';

    ctx.fillStyle = headerColor;
    ctx.font = 'bold 28px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SYSTEM COUNTDOWN', CANVAS_WIDTH / 2, 100);

    // Draw the flip clock countdown
    drawCountdown(remainingMs);

    // Status text
    ctx.fillStyle = '#555';
    ctx.font = '18px "Arial", sans-serif';
    ctx.fillText('EXECUTE PROTOCOL', CANVAS_WIDTH / 2, 380);

    // Warning if getting close to code window
    if (remainingMs <= getCodeWindowMs() + 60000 && remainingMs > getCodeWindowMs()) {
        flickerPhase += 0.1;
        const alpha = 0.5 + Math.sin(flickerPhase) * 0.3;
        ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
        ctx.font = 'bold 22px "Arial", sans-serif';
        ctx.fillText('PREPARE TO ENTER THE NUMBERS', CANVAS_WIDTH / 2, 430);
    }

    drawVignette();
    drawNoise(0.02);
}

function renderCodeWindow(remainingMs) {
    // Urgent dark background
    ctx.fillStyle = '#0a0505';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Flashing warning border
    flickerPhase += 0.15;
    const borderAlpha = 0.3 + Math.sin(flickerPhase) * 0.2;
    ctx.strokeStyle = `rgba(200, 50, 50, ${borderAlpha})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8);

    // Draw smaller countdown at top-left area
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${String(minutes).padStart(3, '0')}:${String(seconds).padStart(2, '0')}`;

    // Update flip digits
    const minStr = String(minutes).padStart(3, '0');
    const secStr = String(seconds).padStart(2, '0');
    const fullTimeStr = minStr + secStr;
    for (let i = 0; i < 5; i++) {
        flipDigits[i].setChar(fullTimeStr[i]);
        flipDigits[i].update();
    }

    // Draw time display (simplified for code window)
    ctx.fillStyle = '#cc0000';
    ctx.font = 'bold 64px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;
    ctx.fillText(timeStr, 220, 110);
    ctx.shadowBlur = 0;

    // Warning text
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 26px "Arial", sans-serif';
    ctx.fillText('ENTER THE NUMBERS', 220, 165);

    // Code display area
    ctx.fillStyle = '#111';
    ctx.fillRect(40, 200, 360, 55);
    ctx.strokeStyle = '#aa3333';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 200, 360, 55);

    // Entered code
    ctx.fillStyle = '#00dd00';
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(enteredCode || '_', 55, 238);
    ctx.textAlign = 'center';

    // The numbers hint
    ctx.fillStyle = '#555';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText('4  8  15  16  23  42', 220, 295);

    // Keypad
    for (const btn of keypadButtons) {
        ctx.fillStyle = '#1a1a1a';
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

    // Instructions
    ctx.fillStyle = '#666';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText('Click or use keyboard', 220, 520);
    ctx.fillText('Enter = submit | Backspace = delete', 220, 540);

    drawVignette();
    drawNoise(0.025);
}

function renderSuccess() {
    // Green success screen
    ctx.fillStyle = '#001a00';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Success glow
    const gradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 300
    );
    gradient.addColorStop(0, 'rgba(0, 100, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Success text
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 64px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 30;
    ctx.fillText('SYSTEM RESET', CANVAS_WIDTH / 2, 250);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#00cc00';
    ctx.font = '32px "Arial", sans-serif';
    ctx.fillText('COUNTDOWN AVERTED', CANVAS_WIDTH / 2, 320);

    ctx.fillStyle = '#008800';
    ctx.font = '24px "Arial", sans-serif';
    const restoredTime = String(settings.countdownMinutes).padStart(3, '0') + ':00';
    ctx.fillText(restoredTime + ' RESTORED', CANVAS_WIDTH / 2, 380);

    // Restart button
    ctx.fillStyle = '#002200';
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
    // Flashing fail screen
    flashPhase += 0.2;
    const flash = Math.sin(flashPhase) > 0;

    ctx.fillStyle = flash ? '#330000' : '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Danger stripes
    if (flash) {
        ctx.fillStyle = '#550000';
        for (let i = 0; i < 20; i++) {
            ctx.fillRect(0, i * 60, CANVAS_WIDTH, 30);
        }
    }

    // Failure text
    ctx.fillStyle = flash ? '#ff0000' : '#880000';
    ctx.font = 'bold 72px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = flash ? 50 : 20;
    ctx.fillText('SYSTEM FAILURE', CANVAS_WIDTH / 2, 250);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff4444';
    ctx.font = '28px "Arial", sans-serif';
    ctx.fillText('PROTOCOL NOT EXECUTED', CANVAS_WIDTH / 2, 320);

    // Restart button
    ctx.fillStyle = '#220000';
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
        currentState === State.STORY || currentState === State.SUCCESS ||
        currentState === State.FAIL) {
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
        case State.STORY:
            renderStory();
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
        // Click anywhere to start scrolling
        currentState = State.SCROLL;
        scrollSpeed = 3;
    } else if (currentState === State.SCROLL) {
        // Click to speed up scroll
        scrollSpeed = Math.min(scrollSpeed + 2, 10);
    } else if (currentState === State.STORY) {
        if (storyComplete) {
            // Start the game
            startGame();
        } else {
            // Click to skip typewriter and show all text
            storyTextIndex = getStoryLines().join('\n').length;
            storyComplete = true;
        }
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
    localStorage.removeItem(STORAGE_KEY);
    endTime = null;
    currentState = State.INTRO;
    enteredCode = '';
    flickerPhase = 0;
    flashPhase = 0;

    // Reset intro animation state
    scrollOffset = 0;
    scrollSpeed = 3;
    storyAlpha = 0;
    storyTextIndex = 0;
    storyComplete = false;

    // Reinitialize rain
    initRain();

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
