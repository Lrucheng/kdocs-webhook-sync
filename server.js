const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Store latest data from webhook
let latestData = {
    companies: [
        { id: 1, name: '科技有限公司A', person: '张三', batch: 1, planDate: '2026-07-15', actualDate: '', status: 'pending', notes: '初步接触，对方表示需要时间考虑' },
        { id: 2, name: '贸易公司B', person: '李四', batch: 1, planDate: '2026-07-20', actualDate: '', status: 'in-progress', notes: '已发出退租通知，等待回复' },
        { id: 3, name: '咨询公司C', person: '王五', batch: 1, planDate: '2026-07-25', actualDate: '', status: 'pending', notes: '' },
        { id: 4, name: '设计工作室D', person: '赵六', batch: 2, planDate: '2026-08-10', actualDate: '', status: 'pending', notes: '合同到期日较远，需提前沟通' },
        { id: 5, name: '广告传媒E', person: '钱七', batch: 2, planDate: '2026-08-15', actualDate: '', status: 'pending', notes: '' },
        { id: 6, name: '电商企业F', person: '孙八', batch: 2, planDate: '2026-08-20', actualDate: '', status: 'pending', notes: '历史合作关系良好，预计沟通顺畅' },
        { id: 7, name: '法律事务所G', person: '周九', batch: 3, planDate: '2026-09-05', actualDate: '', status: 'pending', notes: '' },
        { id: 8, name: '金融公司H', person: '吴十', batch: 3, planDate: '2026-09-10', actualDate: '', status: 'pending', notes: '需法务部门配合审核条款' }
    ],
    updatedAt: new Date().toISOString()
};

// Save data to file for persistence
function saveData() {
    try {
        fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(latestData, null, 2));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

// Load data from file if exists
function loadData() {
    try {
        const dataPath = path.join(__dirname, 'data.json');
        if (fs.existsSync(dataPath)) {
            const raw = fs.readFileSync(dataPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.companies) {
                latestData = parsed;
            }
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
}

loadData();

// Webhook endpoint - receives Kdocs data changes
app.post('/webhook', (req, res) => {
    console.log('Webhook received at:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        const body = req.body;
        
        if (!body) {
            console.log('Empty body received');
            return res.status(200).json({ success: true, message: 'Empty body received' });
        }
        
        // Handle different webhook event types from Kdocs
        // Kdocs webhook may send records array or single record
        const records = body.records || (body.record ? [body.record] : []);
        
        if (records.length === 0) {
            console.log('No records in webhook payload');
            return res.status(200).json({ success: true, message: 'No records to process' });
        }
        
        records.forEach(record => {
            const fields = record.fields || record || {};
            
            // Log field names for debugging
            console.log('Processing record fields:', Object.keys(fields));
            
            const companyName = fields['企业名称'] || fields['name'] || '';
            const existingIdx = latestData.companies.findIndex(c => 
                c.id === record.id || c.name === companyName
            );
            
            const companyData = {
                id: record.id || companyName || Date.now(),
                name: companyName,
                person: fields['责任人'] || fields['person'] || '',
                batch: mapBatch(fields['批次'] || fields['batch']),
                planDate: fields['计划完成时间'] || fields['planDate'] || '',
                actualDate: fields['实际完成时间'] || fields['actualDate'] || '',
                status: mapStatus(fields['状态'] || fields['status']),
                notes: fields['谈判情况备注'] || fields['notes'] || ''
            };
            
            console.log('Mapped company data:', JSON.stringify(companyData));
            
            if (existingIdx >= 0) {
                latestData.companies[existingIdx] = { 
                    ...latestData.companies[existingIdx], 
                    ...companyData 
                };
                console.log('Updated existing company:', companyData.name);
            } else {
                latestData.companies.push(companyData);
                console.log('Added new company:', companyData.name);
            }
        });
        
        latestData.updatedAt = new Date().toISOString();
        saveData();
        console.log('Data saved. Total companies:', latestData.companies.length);
        
        res.status(200).json({ 
            success: true, 
            message: `Webhook processed ${records.length} records`,
            totalCompanies: latestData.companies.length
        });
    } catch (e) {
        console.error('Webhook processing error:', e);
        res.status(200).json({ success: false, error: e.message });
    }
});

// Map batch field to number
function mapBatch(batch) {
    if (typeof batch === 'number') return batch;
    const batchMap = {
        '第一批企业': 1,
        '第二批企业': 2,
        '第三批企业': 3
    };
    return batchMap[batch] || 1;
}

// Map Kdocs status to internal status
function mapStatus(status) {
    const statusMap = {
        '待启动': 'pending',
        '进行中': 'in-progress',
        '谈判中': 'negotiating',
        '已完成': 'completed',
        '受阻': 'blocked'
    };
    return statusMap[status] || 'pending';
}

// API endpoint for frontend to poll data
app.get('/api/data', (req, res) => {
    res.json({
        success: true,
        data: latestData.companies,
        updatedAt: latestData.updatedAt
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Webhook endpoint: POST /webhook`);
    console.log(`Data API: GET /api/data`);
});
