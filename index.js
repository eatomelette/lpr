const axios = require('axios');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const XMLPAHT = path.join(__dirname, 'LPR.xml');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const HTML_OUTPUT_PATH = path.join(__dirname, 'index.html');

const URL = "https://www.shibor.sh.cn/r/cms/www/chinamoney/data/currency/bk-lpr.json";

async function getLpr() {
    let response = await axios({
        method: 'GET',
        url: URL
    });
    if (response.data) {
        let date = response.data.data.showDateCN;
        return {
            date: date,
            LPR1Y: response.data.records[0].shibor / 100,  // 转为小数，如 3.45 -> 0.0345
            LPR5Y: response.data.records[1].shibor / 100   // 转为小数，如 3.95 -> 0.0395
        };
    } else {
        throw new Error('获取LPR失败');
    }
}

/**
 * 读取 XML 中的所有 LPR 历史数据
 */
async function readAllLPRData() {
    try {
        const xmlContent = fs.readFileSync(XMLPAHT, 'utf8');
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlContent);
        
        const lprRecords = result.dataroot.LPR || [];
        
        const allData = lprRecords.map(record => ({
            date: record.date ? record.date[0] : '',
            LPR1Y: record.LPR1Y ? parseFloat(record.LPR1Y[0]) : 0,
            LPR5Y: record.LPR5Y ? parseFloat(record.LPR5Y[0]) : 0
        }));
        
        allData.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });
        
        return allData;
    } catch (error) {
        console.warn('⚠️ 读取 XML 历史数据失败:', error.message);
        return [];
    }
}

async function updateXML(LPRdata) {
    let xml = fs.readFileSync(XMLPAHT);
    let xmlStrings = xml.toString();
    const pattern = /<dataroot>\s+<LPR>\s+<date>(.*?)<\/date>/;
    let date0String = pattern.exec(xmlStrings)[1] || null;

    if (date0String) {
        let date0 = new Date(date0String);
        let date1 = new Date(LPRdata.date);
        const diffInDays = Math.abs(Math.floor((date0 - date1) / 86400000));
        console.log(`📅 距离上次更新: ${diffInDays} 天`);
        if (diffInDays <= 1) {
            console.log("⏭️ XML 无需更新");
        } else {
            let date1String = `${date1.getFullYear()}/${date1.getMonth() + 1}/${date1.getDate()}`;
            let newStrings = `<dataroot>\n    <LPR>\n        <date>${date1String}</date>\n        <LPR1Y>${LPRdata.LPR1Y}</LPR1Y>\n        <LPR5Y>${LPRdata.LPR5Y}</LPR5Y>\n    </LPR>`;
            xmlStrings = xmlStrings.replace('<dataroot>', newStrings);
            try {
                await fs.writeFileSync(XMLPAHT, xmlStrings);
                console.log('✅ XML 文件已更新');
            } catch (err) {
                console.error('❌ 写入 XML 失败:', err);
            }
        }
    }
}

/**
 * 将小数转换为百分比格式
 * 例如：0.03 -> 3.00%
 *      0.035 -> 3.50%
 */
function formatPercent(value) {
    return (value * 100).toFixed(2) + '%';
}

/**
 * 生成 HTML，包含全部历史数据
 */
function generateHTML(LPRdata, allHistoryData) {
    try {
        if (!fs.existsSync(TEMPLATE_PATH)) {
            console.error('❌ 模板文件 template.html 不存在！');
            return;
        }

        const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
        console.log('✅ 模板文件读取成功');

        // 最新数据 - 转换为百分比格式
        const latestData = {
            LPR1Y: formatPercent(LPRdata.LPR1Y),
            LPR5Y: formatPercent(LPRdata.LPR5Y),
            date: LPRdata.date
        };

        // 历史数据表格行 - 转换为百分比格式
        let historyRows = '';
        if (allHistoryData && allHistoryData.length > 0) {
            allHistoryData.forEach((item, index) => {
                const isLatest = index === 0;
                const rowClass = isLatest ? 'latest-row' : '';
                historyRows += `
                    <tr class="${rowClass}">
                        <td>${item.date}</td>
                        <td>${formatPercent(item.LPR1Y)}</td>
                        <td>${formatPercent(item.LPR5Y)}</td>
                    </tr>
                `;
            });
        } else {
            historyRows = `
                <tr>
                    <td colspan="3" style="text-align:center; color:#999; padding:30px;">
                        暂无历史数据
                    </td>
                </tr>
            `;
        }

        // 替换模板占位符
        let htmlContent = template;
        htmlContent = htmlContent.replace(/\{\{LPR1Y\}\}/g, latestData.LPR1Y);
        htmlContent = htmlContent.replace(/\{\{LPR5Y\}\}/g, latestData.LPR5Y);
        htmlContent = htmlContent.replace(/\{\{date\}\}/g, latestData.date);
        htmlContent = htmlContent.replace(/\{\{historyRows\}\}/g, historyRows);
        htmlContent = htmlContent.replace(/\{\{totalCount\}\}/g, allHistoryData.length || 0);

        fs.writeFileSync(HTML_OUTPUT_PATH, htmlContent, 'utf8');
        console.log('✅ HTML 文件生成成功！');
        console.log(`📄 输出路径: ${HTML_OUTPUT_PATH}`);
        console.log(`📊 共包含 ${allHistoryData.length} 条历史记录`);

        // 打印预览
        console.log('\n📊 最新数据预览：');
        console.log(`   📅 日期: ${latestData.date}`);
        console.log(`   📈 1年期 LPR: ${latestData.LPR1Y}`);
        console.log(`   📈 5年期以上 LPR: ${latestData.LPR5Y}`);

    } catch (error) {
        console.error('❌ 生成 HTML 失败:', error.message);
    }
}

async function main() {
    try {
        console.log('🚀 开始获取 LPR 数据...');
        const LPRdata = await getLpr();
        console.log('✅ LPR 数据获取成功');
        console.log(`   📅 日期: ${LPRdata.date}`);
        console.log(`   📈 1年期: ${LPRdata.LPR1Y} (小数)`);
        console.log(`   📈 5年期以上: ${LPRdata.LPR5Y} (小数)`);

        console.log('\n📝 正在更新 XML 文件...');
        await updateXML(LPRdata);

        console.log('\n📊 读取全部历史数据...');
        const allHistoryData = await readAllLPRData();
        console.log(`✅ 读取到 ${allHistoryData.length} 条历史记录`);

        console.log('\n🌐 正在生成 HTML 页面...');
        generateHTML(LPRdata, allHistoryData);

        console.log('\n🎉 所有任务完成！');

    } catch (error) {
        console.error('❌ 程序执行失败:', error.message);
        process.exit(1);
    }
}

main();