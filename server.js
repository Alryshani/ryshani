const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const moment = require('moment');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// إعداد قاعدة البيانات
const db = new sqlite3.Database('currency_rates.db');

// إعداد الجداول
db.serialize(() => {
    // جدول أسعار العملات الحالية
    db.run(`CREATE TABLE IF NOT EXISTS current_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        currency_code TEXT NOT NULL UNIQUE,
        currency_name TEXT NOT NULL,
        rate REAL NOT NULL,
        change_percentage REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // جدول تاريخ الأسعار
    db.run(`CREATE TABLE IF NOT EXISTS rate_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        currency_code TEXT NOT NULL,
        rate REAL NOT NULL,
        change_percentage REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // إضافة البيانات الأولية
    const initialData = [
        { code: 'usd', name: 'دولار أمريكي', rate: 530 },
        { code: 'eur', name: 'يورو', rate: 580 },
        { code: 'sar', name: 'ريال سعودي', rate: 141 },
        { code: 'aed', name: 'درهم إماراتي', rate: 144 },
        { code: 'gbp', name: 'جنيه إسترليني', rate: 670 },
        { code: 'kwd', name: 'دينار كويتي', rate: 1720 },
        { code: 'qar', name: 'ريال قطري', rate: 145 },
        { code: 'omr', name: 'ريال عماني', rate: 1375 },
        { code: 'bhd', name: 'دينار بحريني', rate: 1405 }
    ];

    initialData.forEach(currency => {
        db.get('SELECT * FROM current_rates WHERE currency_code = ?', [currency.code], (err, row) => {
            if (!row) {
                db.run('INSERT INTO current_rates (currency_code, currency_name, rate) VALUES (?, ?, ?)',
                    [currency.code, currency.name, currency.rate]);
            }
        });
    });
});

// الإعدادات الوسيطة
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// توجيه الصفحات الثابتة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API للحصول على جميع أسعار العملات
app.get('/api/currency-rates', (req, res) => {
    db.all('SELECT * FROM current_rates', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API للحصول على تاريخ عملة معينة
app.get('/api/currency-history/:code', async (req, res) => {
    try {
        const currencyCode = req.params.code.toLowerCase();
        const sql = `
            SELECT rate, change_percentage, updated_at 
            FROM rate_history 
            WHERE currency_code = ? 
            ORDER BY updated_at DESC 
            LIMIT 10
        `;
        const rows = await new Promise((resolve, reject) => {
            db.all(sql, [currencyCode], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'حدث خطأ في جلب تاريخ العملة' });
    }
});

// API لتحديث سعر عملة
app.post('/api/update-rate', (req, res) => {
    const { currency_code, rate } = req.body;
    
    db.get('SELECT * FROM current_rates WHERE currency_code = ?', [currency_code], (err, currentRate) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        if (currentRate) {
            // حساب نسبة التغيير
            const changePercentage = ((rate - currentRate.rate) / currentRate.rate) * 100;

            // حفظ السجل الحالي في التاريخ
            db.run('INSERT INTO rate_history (currency_code, rate, change_percentage) VALUES (?, ?, ?)',
                [currency_code, currentRate.rate, currentRate.change_percentage]);

            // تحديث السعر الحالي
            db.run('UPDATE current_rates SET rate = ?, change_percentage = ?, updated_at = CURRENT_TIMESTAMP WHERE currency_code = ?',
                [rate, changePercentage, currency_code],
                (err) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    res.json({ success: true, rate, changePercentage });
                });
        } else {
            res.status(404).json({ error: 'Currency not found' });
        }
    });
});

// دالة لتحديث أسعار العملات من API
async function updateRatesFromAPI() {
    try {
        // استخدام API يمني للحصول على أسعار صنعاء
        const response = await axios.get('https://yemenexchange.com/api/v1/rates');
        
        if (!response.data || !response.data.data) {
            throw new Error('لم يتم العثور على بيانات من API');
        }

        const rates = response.data.data;
        
        // تعيين العملات التي نريد تحديثها
        const currencies = {
            usd: { name: 'دولار أمريكي', key: 'usd_buy' },
            eur: { name: 'يورو', key: 'eur_buy' },
            sar: { name: 'ريال سعودي', key: 'sar_buy' },
            aed: { name: 'درهم إماراتي', key: 'aed_buy' },
            gbp: { name: 'جنيه إسترليني', key: 'gbp_buy' },
            kwd: { name: 'دينار كويتي', key: 'kwd_buy' },
            qar: { name: 'ريال قطري', key: 'qar_buy' },
            omr: { name: 'ريال عماني', key: 'omr_buy' },
            bhd: { name: 'دينار بحريني', key: 'bhd_buy' }
        };

        // تحديث كل عملة في قاعدة البيانات
        for (const [code, currency] of Object.entries(currencies)) {
            const oldRate = await new Promise((resolve) => {
                db.get('SELECT rate FROM current_rates WHERE currency_code = ?', [code], (err, row) => {
                    resolve(row ? row.rate : 0);
                });
            });

            // الحصول على السعر الجديد من API اليمني
            const newRate = rates[currency.key] || oldRate;
            const changePercentage = oldRate ? ((newRate - oldRate) / oldRate) * 100 : 0;

            // حفظ السعر القديم في التاريخ
            if (oldRate > 0) {
                await new Promise((resolve) => {
                    db.run('INSERT INTO rate_history (currency_code, rate, change_percentage) VALUES (?, ?, ?)',
                        [code, oldRate, changePercentage],
                        resolve
                    );
                });
            }
            
            // تحديث السعر الجديد
            await new Promise((resolve) => {
                db.run(`
                    UPDATE current_rates 
                    SET rate = ?, change_percentage = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE currency_code = ?
                `, [newRate, changePercentage, code], resolve);
            });
        }

        return { 
            success: true, 
            message: 'تم تحديث أسعار العملات بنجاح (أسعار صنعاء)',
            source: 'Yemen Exchange API'
        };
    } catch (error) {
        console.error('خطأ في تحديث الأسعار:', error);
        
        // في حالة فشل API اليمني، نستخدم API احتياطي
        try {
            const backupResponse = await axios.get('https://api.exchangerate.host/latest?base=USD');
            const rates = backupResponse.data.rates;
            
            const currencies = {
                usd: { name: 'دولار أمريكي', rate: 1 },
                eur: { name: 'يورو', rate: 1/rates.EUR },
                sar: { name: 'ريال سعودي', rate: 1/rates.SAR },
                aed: { name: 'درهم إماراتي', rate: 1/rates.AED },
                gbp: { name: 'جنيه إسترليني', rate: 1/rates.GBP },
                kwd: { name: 'دينار كويتي', rate: 1/rates.KWD },
                qar: { name: 'ريال قطري', rate: 1/rates.QAR },
                omr: { name: 'ريال عماني', rate: 1/rates.OMR },
                bhd: { name: 'دينار بحريني', rate: 1/rates.BHD }
            };

            for (const [code, currency] of Object.entries(currencies)) {
                const oldRate = await new Promise((resolve) => {
                    db.get('SELECT rate FROM current_rates WHERE currency_code = ?', [code], (err, row) => {
                        resolve(row ? row.rate : 0);
                    });
                });

                const newRate = currency.rate * rates.YER;
                const changePercentage = oldRate ? ((newRate - oldRate) / oldRate) * 100 : 0;

                if (oldRate > 0) {
                    await new Promise((resolve) => {
                        db.run('INSERT INTO rate_history (currency_code, rate, change_percentage) VALUES (?, ?, ?)',
                            [code, oldRate, changePercentage],
                            resolve
                        );
                    });
                }

                await new Promise((resolve) => {
                    db.run(`
                        UPDATE current_rates 
                        SET rate = ?, change_percentage = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE currency_code = ?
                    `, [newRate, changePercentage, code], resolve);
                });
            }

            return { 
                success: true, 
                message: 'تم تحديث الأسعار باستخدام المصدر الاحتياطي',
                source: 'Exchange Rate API'
            };
        } catch (backupError) {
            console.error('خطأ في تحديث الأسعار من المصدر الاحتياطي:', backupError);
            return { 
                success: false, 
                message: 'فشل تحديث الأسعار من جميع المصادر'
            };
        }
    }
}

// API لتحديث الأسعار تلقائياً
app.post('/api/update-rates-auto', async (req, res) => {
    const result = await updateRatesFromAPI();
    res.json(result);
});

// تشغيل الخادم
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
