# Dockerfile
FROM node:18-slim

# تثبيت لغة Lua 5.1 داخل نظام السيرفر تلقائياً
RUN apt-get update && apt-get install -y lua5.1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# نسخ ملفات الحزم وتثبيتها
COPY package*.json ./
RUN npm install

# نسخ بقية ملفات المشروع ومحرك Hercules
COPY . .

# تحديد البورت
EXPOSE 3000

# تشغيل السيرفر والبوت معاً
CMD ["node", "api/obfuscate.js"]
