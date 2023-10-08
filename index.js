const axios = require('axios');

const fs = require('fs');
const path = require('path');

const XMLPAHT = path.join(__dirname,'data','LPR.xml');

const ULR = "https://www.shibor.org/r/cms/www/chinamoney/data/currency/bk-lpr.json";

async function getLpr(){
    let response = await axios({
        method: 'GET',
        url:ULR
    });
    if(response.data){
        let date =  response.data.data.showDateCN
        return {
            date:date,
            LPR1Y:response.data.records[0].shibor/100,
            LPR5Y:response.data.records[1].shibor/100
        }
    }
    else{
        throw new Error('获取LPR失败')
    }
   
}

async function updateXML(LPRdata){
    let xml = fs.readFileSync(XMLPAHT);
    let xmlStrings = xml.toString();
    const pattern = /<dataroot>\s+<LPR>\s+<date>(.*?)<\/date>/
    let date0String = pattern.exec(xmlStrings)[1] || null

    if(date0String){
        let date0 = new Date(date0String);
        let date1 = new Date(LPRdata.date);
        const diffInDays = Math.abs(Math.floor((date0 - date1) / 86400000));
        console.log(diffInDays)
        if(diffInDays<=1){
            console.log("无需更新")
        }else{
            let date1String = `${date1.getFullYear()}/${date1.getMonth() + 1}/${date1.getDate()}`
            let newStrings = `<dataroot>\n    <LPR>\n        <date>${date1String}</date>\n        <LPR1Y>${LPRdata.LPR1Y}</LPR1Y>\n        <LPR5Y>${LPRdata.LPR5Y}</LPR5Y>\n    </LPR>`
            xmlStrings = xmlStrings.replace('<dataroot>',newStrings);
            try{
                await fs.writeFileSync(XMLPAHT,xmlStrings);
                console.log('文件已被保存');
            }catch (err) {
                console.error(err);
            }
        }
    }
} 

async function main(){
    let LPRdata = await getLpr();
    await updateXML(LPRdata)
}
main()