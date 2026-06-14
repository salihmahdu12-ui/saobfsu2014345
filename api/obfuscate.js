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

// ذاكرة مؤقتة لحفظ السكريبتات المشفرة وإعطائها معرّف فريد للرابط
const encryptedScripts = {};

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

    // نرسل الكود الأصلي بدون أي تعديل عشان هيراكولس يشتغل بقوته الكاملة
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
    fs.readFile(outputPath, 'utf8', (readErr, obfuscatedResult) => {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        if (readErr) return callback(readErr, null);
        
        // ✨ تم إلغاء سهر الـ print، وإضافة مسافة سطرين فارغين بالكامل للترتيب والأمان قبل الـ return
        const cleanResult = obfuscatedResult + "\n\n\n";
        callback(null, cleanResult);
    });
}

// 🌐 مسار الويب لجلب السكريبت (يحجب المتصفحات ويقبل نظام ألعاب اللوا فقط)
app.get('/raw/:id', (req, res) => {
    const scriptId = req.params.id;
    const scriptCode = encryptedScripts[scriptId];

    if (!scriptCode) {
        return res.status(404).send('Error: Script expired or not found.');
    }

    const userAgent = req.headers['user-agent'] || '';

    // حظر المتصفحات بالكامل لحماية السورس كود من الكشف المباشر
    if (userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari') || userAgent.includes('Windows')) {
        return res.status(403).send('🛡️ [SA | OBFUSCATOR] Access Denied: Direct browser access to this source script is prohibited.');
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(scriptCode);
});

// استقبال طلبات التشفير العادية من الموقع
app.post('/obfuscate', (req, res) => {
    if (!req.body.code) return res.status(400).json({ error: 'No code provided' });
    
    runHercules(req.body.code, (err, result) => {
        if (err) return res.status(500).json({ error: 'Obfuscation Engine Crashed', details: err });
        res.json({ obfuscated: result });
    });
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🌐 [SA | OBFUSCATOR] Production Active on Port ${PORT}`);
    console.log(`==================================================`);
});

// 🤖 نظام بوت الديسكورد المطور لتسليم روابط الـ Loadstring
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (DISCORD_TOKEN) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages
        ],
        partials: [Partials.Channel, Partials.Message, Partials.User] 
    });

    client.once('ready', () => {
        console.log(`🤖 [SA | OBFUSCATOR] Bot Active!`);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const isRealCommand = message.content.trim().startsWith('!obf');

        if (isRealCommand) {
            if (message.channel.type !== ChannelType.DM) {
                if (message.deletable) await message.delete().catch(() => {});
                return message.reply("⚠️ الأوامر تعمل في الخاص فقط لحماية خصوصية أكوادك.").then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                }).catch(() => {});
            }

            const userStatus = checkUserStatus(message.author.id);
            if (!userStatus.isVip && userStatus.remaining <= 0) {
                return message.reply("❌ لقد استهلكت حدّك المجاني المسموح به اليوم (تشفيرين باليوم).\n👑 للاشتراك المفتوح تواصل مع الإدارة.");
            }

            let codeToObfuscate = "";
            if (message.attachments.size > 0) {
                const file = message.attachments.first();
                try {
                    const response = await fetch(file.url);
                    codeToObfuscate = await response.text();
                } catch (e) {
                    return message.reply("❌ فشل في تحميل الملف.");
                }
            } else {
                codeToObfuscate = message.content.slice(4).trim();
            }
            
            if (!codeToObfuscate) return message.reply("⚠️ الرجاء كتابة الكود أو إرفاق ملف لتشفيره.");

            const waitingMsg = await message.reply('⏳ **جاري التشفير بأقصى قوة حماية...**');

            runHercules(codeToObfuscate, async (err, result) => {
                if (err) return waitingMsg.edit(`❌ فشل التشفير، يرجى التحقق من صياغة الكود.`);

                const currentStats = getStats();
                const today = new Date().toISOString().split('T')[0];
                currentStats.totalObfuscations += 1;
                if (!currentStats.uniqueUsers.includes(message.author.id)) currentStats.uniqueUsers.push(message.author.id);
                if (!userStatus.isVip) {
                    if (!currentStats.dailyLimits[today]) currentStats.dailyLimits[today] = {};
                    currentStats.dailyLimits[today][message.author.id] = (currentStats.dailyLimits[today][message.author.id] || 0) + 1;
                }
                saveStats(currentStats);

                const scriptToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                encryptedScripts[scriptToken] = result;

                const appUrl = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : `http://localhost:${PORT}`;
                const loadstringLink = `${appUrl}/raw/${scriptToken}`;

                // الرسالة الفخمة المعتمدة مع رابط الـ ديسكورد والمظهر النظيف
                const finalMessage = `👑 **تم التشفير والحماية بنجاح!**\n\n` +
                                     `\`\`\`lua\nloadstring(game:HttpGet("${loadstringLink}"))()\n\`\`\`\n\n` +
                                     `📢 **تبي تشفر زي كذا تفضل ديسكورد:**\n> https://discord.gg/SMDKFTttCW`;

                await waitingMsg.edit(finalMessage);
            });
        }
    });

    client.login(DISCORD_TOKEN).catch(err => console.error("Discord login failed:", err));
}
