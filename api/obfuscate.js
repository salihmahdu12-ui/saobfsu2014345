// api/obfuscate.js
// 🛡️ Powered by: SA | OBFUSCATOR 🛡️
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, Partials } = require('discord.js');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../')));

const statsPath = path.join(__dirname, '../stats.json');

if (!global.securedCache) {
    global.securedCache = {};
}

function getStats() {
    if (!fs.existsSync(statsPath)) {
        return { totalObfuscations: 0, uniqueUsers: [], dailyLimits: {}, vips: {} };
    }
    try {
        const data = fs.readFileSync(statsPath, 'utf8');
        const parsed = JSON.parse(data);
        if (!parsed.dailyLimits) parsed.dailyLimits = {};
        if (!parsed.vips) parsed.vips = {};
        return parsed;
    } catch (e) {
        return { totalObfuscations: 0, uniqueUsers: [], dailyLimits: {}, vips: {} };
    }
}

function saveStats(stats) {
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8');
    } catch (e) {
        console.error("Failed to save stats:", e);
    }
}

function checkUserStatus(userId) {
    const stats = getStats();
    const today = new Date().toISOString().split('T')[0];

    if (stats.vips && stats.vips[userId]) {
        const expiryDate = stats.vips[userId];
        if (new Date(today) <= new Date(expiryDate)) {
            return { isVip: true, expiry: expiryDate };
        } else {
            delete stats.vips[userId];
            saveStats(stats);
        }
    }

    if (!stats.dailyLimits[today]) {
        stats.dailyLimits[today] = {};
    }
    const userCount = stats.dailyLimits[today][userId] || 0;

    return { isVip: false, usedToday: userCount, remaining: Math.max(0, 2 - userCount) };
}

function runHercules(code, callback) {
    const rootDir = path.join(__dirname, '../');
    const uniqueId = Date.now();
    const tempInputPath = path.join(rootDir, `temp_${uniqueId}.lua`);
    const expectedOutputPath = path.join(rootDir, `temp_${uniqueId}_obfuscated.lua`);

    fs.writeFile(tempInputPath, code, 'utf8', (err) => {
        if (err) return callback(err, null);

        const herculesPath = path.join(rootDir, 'hercules.lua');
        
        exec(`lua "${herculesPath}" "${tempInputPath}"`, { cwd: rootDir }, (execErr, stdout, stderr) => {
            if (execErr) {
                exec(`lua5.1 "${herculesPath}" "${tempInputPath}"`, { cwd: rootDir }, (execErr2, stdout2, stderr2) => {
                    if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                    if (execErr2) {
                        if (fs.existsSync(expectedOutputPath)) fs.unlinkSync(expectedOutputPath);
                        return callback(stderr2 || execErr2.message, null);
                    }
                    handleOutput(expectedOutputPath, callback);
                });
            } else {
                if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                handleOutput(expectedOutputPath, callback);
            }
        });
    });
}

function handleOutput(outputPath, callback) {
    if (!fs.existsSync(outputPath)) {
        return callback("Output file missing", null);
    }
    // نقرأ مخرجات هيراكولس كـ Buffer ونحولها فوراً إلى Base64 لمنع تداخل الحروف والمسافات
    fs.readFile(outputPath, (readErr, dataBuffer) => {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        if (readErr) return callback(readErr, null);
        
        const base64Code = dataBuffer.toString('base64');
        callback(null, base64Code);
    });
}

// 🌐 مسار جلب السكريبت (يرسل كود الـ Base64 الصافي المحمي من تلاعب السيرفرات)
app.get('/raw/:id', (req, res) => {
    const scriptId = req.params.id;
    const base64Code = global.securedCache[scriptId];

    if (!base64Code) {
        return res.status(200).send('print("Expired Token")');
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(base64Code);
