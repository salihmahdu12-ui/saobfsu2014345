// api/obfuscate.js
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, AttachmentBuilder, ChannelType, Partials } = require('discord.js');

// تفعيل قراءة متغيرات البيئة محلياً من ملف .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../')));

// دالة المعالجة المشتركة لتشغيل محرك Hercules
function runHercules(code, callback) {
    const rootDir = path.join(__dirname, '../');
    const uniqueId = Date.now();
    const tempInputPath = path.join(rootDir, `temp_${uniqueId}.lua`);
    const expectedOutputPath = path.join(rootDir, `temp_${uniqueId}_obfuscated.lua`);

    fs.writeFile(tempInputPath, code, 'utf8', (err) => {
        if (err) return callback(err, null);

        const herculesPath = path.join(rootDir, 'hercules.lua');
        
        // تحديد مفسر لغة Lua بناءً على نظام التشغيل (ويندوز أو لينكس داخل سيرفر Railway)
        const luaCommand = process.platform === "win32" ? "lua" : "lua5.1";
        
        exec(`${luaCommand} "${herculesPath}" "${tempInputPath}"`, { cwd: rootDir }, (execErr, stdout, stderr) => {
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);

            if (execErr) {
                if (fs.existsSync(expectedOutputPath)) fs.unlinkSync(expectedOutputPath);
                return callback(stderr || execErr.message, null);
            }

            if (!fs.existsSync(expectedOutputPath)) {
                return callback("Output file not found by engine", null);
            }

            fs.readFile(expectedOutputPath, 'utf8', (readErr, obfuscatedResult) => {
                if (fs.existsSync(expectedOutputPath)) fs.unlinkSync(expectedOutputPath);
                if (readErr) return callback(readErr, null);
                
                callback(null, obfuscatedResult);
            });
        });
    });
}

// 🌐 [API الموقع] استقبال طلبات التشفير من المتصفح
app.post('/obfuscate', (req, res) => {
    if (!req.body.code) return res.status(400).json({ error: 'No code provided' });
    
    runHercules(req.body.code, (err, result) => {
        if (err) return res.status(500).json({ error: 'Obfuscation Engine Crashed', details: err });
        res.json({ obfuscated: result });
    });
});

app.listen(PORT, () => {
    console.log(`Web server successfully deployed on port ${PORT}`);
});

// 🤖 [بوت الديسكورد] تشغيل وإصلاح قنوات الخاص ودعم الملفات النصية و الـ Lua
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (DISCORD_TOKEN) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages
        ],
        // تفعيل الـ Partials بالكامل لضمان الرد الفوري في الخاص وعدم تجاهل الرسائل
        partials: [Partials.Channel, Partials.Message, Partials.User] 
    });

    client.once('ready', () => {
        console.log(`Discord Bot initialized. Logged in as ${client.user.tag}`);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        if (message.content.startsWith('!obf')) {
            
            // 🔒 حماية: إذا تم كتابة الأمر في سيرفر عام وليس في الخاص (DM)
            if (message.channel.type !== ChannelType.DM) {
                if (message.deletable) await message.delete().catch(() => {});
                
                return message.reply("❌ **أمن الكود أولاً!** لأسباب أمنية وحماية لأكوادك، أمر التشفير يشتغل في **الخاص فقط**. أرسل ملفك أو كودك هنا في رسالة خاصة لي مباشرة.")
                    .then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 7000);
                    }).catch(() => {});
            }

            let codeToObfuscate = "";

            // 1. التحقق من وجود ملف مرفق مع الأمر (.lua أو .txt)
            if (message.attachments.size > 0) {
                const file = message.attachments.first();
                const fileExt = path.extname(file.name).toLowerCase();

                if (fileExt === '.lua' || fileExt === '.txt') {
                    try {
                        const response = await fetch(file.url);
                        codeToObfuscate = await response.text();
                    } catch (fetchErr) {
                        return message.reply("❌ فشل في تحميل وقراءة الملف المرفق. تأكد من سلامة الملف.");
                    }
                } else {
                    return message.reply("❌ صيغة الملف غير مدعومة! يرجى رفع ملف بصيغة `.lua` أو `.txt` فقط.");
                }
            } else {
                // 2. إذا لم يكن هناك ملف، نأخذ النص المكتوب بعد الأمر مباشرة
                codeToObfuscate = message.content.slice(4).trim();
            }
            
            if (!codeToObfuscate) {
                return message.reply('❌ يرجى إدخال الكود أو رفع ملف نصي مع الأمر! أمثلة:\n• `!obf print("Hello")`\n• أرسل ملف `.lua` واكتب معه في الوصف `!obf`');
            }

            const waitingMsg = await message.reply('⏳ جاري قراءة الكود وتشفيره عبر محرك Hercules...');

            runHercules(codeToObfuscate, async (err, result) => {
                if (err) {
                    return waitingMsg.edit("❌ فشل التشفير بسبب خطأ بالمحرك:\n```text\n" + err + "\n```");
                }

                // إذا كان الناتج طويلاً أو تم رفع ملف، يُعاد بصيغة ملف لتنظيمه بداخل الخاص
                if (result.length > 1900 || message.attachments.size > 0) {
                    const attachment = new AttachmentBuilder(Buffer.from(result), { name: 'obfuscated_hercules.lua' });
                    await message.reply({ content: '✅ تم التشفير بنجاح! تم تصدير الناتج كملف جاهز:', files: [attachment] });
                    waitingMsg.delete().catch(() => {});
                } else {
                    waitingMsg.edit("✅ **تم التشفير بنجاح:**\n```lua\n" + result + "\n```");
                }
            });
        }
    });

    client.login(DISCORD_TOKEN).catch(err => console.error("Discord login failed:", err));
} else {
    console.log("Environment variable 'DISCORD_TOKEN' not set. Discord bot feature is suspended.");
}
