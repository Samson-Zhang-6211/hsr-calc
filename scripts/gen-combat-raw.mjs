import fs from 'node:fs';

const out = {};
const get = (file, id, which) => {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const zh = d.zh ?? d;
  const sk = which === 'memo' ? zh.memosprite.skills[id] : zh.skills[id];
  const params = {};
  for (const [k, v] of Object.entries(sk.level)) params[k] = v.param_list;
  return {
    type: sk.type,
    tag: sk.tag,
    stance: sk.show_stance_list,
    sp: sk.sp_base,
    bpN: sk.bp_need,
    bpA: sk.bp_add,
    params,
  };
};

for (const id of ['151201', '151202', '151203', '151204', '151207']) out[id] = get('data/characters/1512.json', id, 'skill');
out['1151201'] = get('data/characters/1512.json', '1151201', 'memo');
out['1151203'] = get('data/characters/1512.json', '1151203', 'memo');
for (const id of ['131301', '131302', '131303', '131304', '131307']) out[id] = get('data/characters/1313.json', id, 'skill');
for (const id of ['120401', '120402', '120403', '120404', '120407']) out[id] = get('data/characters/1204.json', id, 'skill');
// 姬子 1003：普攻/战技/终结技/天赋/秘技（100306 MazeNormal 不进战斗）
for (const id of ['100301', '100302', '100303', '100304', '100306', '100307']) out[id] = get('data/characters/1003.json', id, 'skill');
// 乱破 1317：普攻/战技/终结技/天赋/秘技/强化普攻三段（131708/131710/131712 为分段落点，131718 为总技能）
for (const id of ['131701', '131702', '131703', '131704', '131706', '131707', '131708', '131710', '131712', '131718']) out[id] = get('data/characters/1317.json', id, 'skill');
// 姬子•启行 1510：普攻/战技/终结技/天赋/秘技/拓星者光束/脉冲/收尾/助战技/同行协议裁决/歼破
for (const id of ['151001', '151002', '151003', '151004', '151007', '151008', '151009', '151014', '151022', '151025', '151026']) out[id] = get('data/characters/1510.json', id, 'skill');
// 大黑塔 1401：普攻/战技/终结技/天赋/秘技/强化战技
for (const id of ['140101', '140102', '140103', '140104', '140107', '140109']) out[id] = get('data/characters/1401.json', id, 'skill');
// 黑塔 1013：普攻/战技/终结技/天赋/秘技（101306 MazeNormal 不进战斗）
for (const id of ['101301', '101302', '101303', '101304', '101306', '101307']) out[id] = get('data/characters/1013.json', id, 'skill');
// 希露瓦 1103：普攻/战技/终结技/天赋/秘技（110306 MazeNormal 不进战斗）
for (const id of ['110301', '110302', '110303', '110304', '110306', '110307']) out[id] = get('data/characters/1103.json', id, 'skill');
// 那刻夏 1405：普攻/战技/终结技/天赋/秘技（140506 MazeNormal 不进战斗）
for (const id of ['140501', '140502', '140503', '140504', '140506', '140507']) out[id] = get('data/characters/1405.json', id, 'skill');
// 翡翠 1314：普攻/战技/终结技/天赋/秘技（131406 MazeNormal 不进战斗）
for (const id of ['131401', '131402', '131403', '131404', '131406', '131407']) out[id] = get('data/characters/1314.json', id, 'skill');
// 银枝 1302：普攻/战技/终结技/强化终结技/天赋/秘技（130206 MazeNormal 不进战斗）
for (const id of ['130201', '130202', '130203', '130204', '130206', '130207', '130214']) out[id] = get('data/characters/1302.json', id, 'skill');
// 青雀 1201：普攻/战技/终结技/天赋/秘技/强化普攻（120106 MazeNormal 不进战斗）
for (const id of ['120101', '120102', '120103', '120104', '120106', '120107', '120108']) out[id] = get('data/characters/1201.json', id, 'skill');
// 远坂凛 1508：普攻/战技/终结技/天赋/自在远坂流/秘技/强化战技（150806 MazeNormal 不进战斗；150805 本轮留口）
for (const id of ['150801', '150802', '150803', '150804', '150805', '150806', '150807', '150809']) out[id] = get('data/characters/1508.json', id, 'skill');
for (const id of ['141401', '141402', '141403', '141404']) out[id] = get('data/characters/1414.json', id, 'skill');
// 阿格莱雅 1402：普攻/战技(召唤形态)/终结技/天赋/秘技/强化普攻 + 衣匠忆灵技
for (const id of ['140201', '140202', '140203', '140204', '140207', '140208']) out[id] = get('data/characters/1402.json', id, 'skill');
for (const id of ['1140201', '1140203', '1140205', '1140206']) out[id] = get('data/characters/1402.json', id, 'memo');
// 啊哈 1511：普攻/战技/终结技/天赋/秘技/欢愉技/行迹(欢愉万相/欢愉负债)
for (const id of ['151101', '151102', '151103', '151104', '151107', '151120', '151129', '151131']) out[id] = get('data/characters/1511.json', id, 'skill');
// 爻光 1502：普攻/战技/终结技/天赋/秘技/欢愉技/行迹(欢愉万相★心灵感应)
for (const id of ['150201', '150202', '150203', '150204', '150207', '150220', '150229']) out[id] = get('data/characters/1502.json', id, 'skill');
// 火花 1501：普攻/战技/终结技/天赋/秘技/强化普攻/互动陷阱/欢愉技/行迹(欢愉万相★兔子戏法)
for (const id of ['150101', '150102', '150103', '150104', '150107', '150108', '150109', '150120', '150129']) out[id] = get('data/characters/1501.json', id, 'skill');
// 狼尊 1506 银狼LV.999：普攻/战技/终结技/天赋/秘技/强化普攻/欢愉技(回放/演示)/行迹(欢愉万相★全息幻象)
for (const id of ['150601', '150602', '150603', '150604', '150607', '150608', '150620', '150621', '150629']) out[id] = get('data/characters/1506.json', id, 'skill');
// 绯英 1505：普攻/战技/终结技/天赋/秘技/欢愉技/行迹(欢愉万相★书中折花)
for (const id of ['150501', '150502', '150503', '150504', '150507', '150520', '150529']) out[id] = get('data/characters/1505.json', id, 'skill');
// 水砂 1513 砂金•戏浪：普攻/战技/终结技/天赋/秘技/举杯/All in/行迹(欢愉万相★三赌牌局)
for (const id of ['151301', '151302', '151303', '151304', '151307', '151320', '151321', '151329']) out[id] = get('data/characters/1513.json', id, 'skill');
// 真珠 1503：普攻/战技/终结技/天赋/秘技/强化普攻×2/欢愉技/行迹(欢愉万相)
for (const id of ['150301', '150302', '150303', '150304', '150307', '150308', '150310', '150320', '150329']) out[id] = get('data/characters/1503.json', id, 'skill');
// 缇宝 1403：普攻/战技/终结技/天赋/秘技
for (const id of ['140301', '140302', '140303', '140304', '140307']) out[id] = get('data/characters/1403.json', id, 'skill');
// 同谐开拓者 8005/8006（技能同构，仅取 8005 参数；引擎双 id 共用，同 8007/8009 先例）：
// 普攻/战技/终结技/天赋/秘技（800506 迷宫普攻不进战斗）
for (const id of ['800501', '800502', '800503', '800504', '800507']) out[id] = get('data/characters/8005.json', id, 'skill');
// 刻律德菈 1412：普攻/战技/终结技/天赋/秘技
for (const id of ['141201', '141202', '141203', '141204', '141207']) out[id] = get('data/characters/1412.json', id, 'skill');
// 知更鸟 1309：普攻/战技/终结技/天赋/秘技
for (const id of ['130901', '130902', '130903', '130904', '130907']) out[id] = get('data/characters/1309.json', id, 'skill');
// 阮•梅 1303：普攻/战技/终结技/天赋/秘技
for (const id of ['130301', '130302', '130303', '130304', '130307']) out[id] = get('data/characters/1303.json', id, 'skill');

// 花火 1306（加强版，基础字段已被 apply-1306-enhanced.mjs 覆写）：普攻/战技/终结技/天赋/秘技
for (const id of ['130601', '130602', '130603', '130604', '130607']) out[id] = get('data/characters/1306.json', id, 'skill');
// 藿藿 1217（加强版，基础字段已被 apply-1217-enhanced.mjs 覆写）：普攻/战技/终结技/天赋/秘技
for (const id of ['121701', '121702', '121703', '121704', '121707']) out[id] = get('data/characters/1217.json', id, 'skill');
// 罗刹 1203：普攻/战技/终结技/天赋/秘技
for (const id of ['120301', '120302', '120303', '120304', '120307']) out[id] = get('data/characters/1203.json', id, 'skill');
// 灵砂 1222：普攻/战技/终结技/天赋/秘技（122206 MazeNormal 不进战斗）
for (const id of ['122201', '122202', '122203', '122204', '122207']) out[id] = get('data/characters/1222.json', id, 'skill');
// 娜塔莎 1105：普攻/战技/终结技/天赋/秘技（110506 MazeNormal 不进战斗）
for (const id of ['110501', '110502', '110503', '110504', '110507']) out[id] = get('data/characters/1105.json', id, 'skill');
// 玲可 1110：普攻/战技/终结技/天赋/秘技（111006 MazeNormal 不进战斗）
for (const id of ['111001', '111002', '111003', '111004', '111007']) out[id] = get('data/characters/1110.json', id, 'skill');
// 白露 1211：普攻/战技/终结技/天赋/秘技（121106 MazeNormal 不进战斗）
for (const id of ['121101', '121102', '121103', '121104', '121107']) out[id] = get('data/characters/1211.json', id, 'skill');
// 加拉赫 1301：普攻/战技/终结技/天赋/秘技/强化普攻（130106 MazeNormal 不进战斗）
for (const id of ['130101', '130102', '130103', '130104', '130107', '130108']) out[id] = get('data/characters/1301.json', id, 'skill');
// 开拓者·欢愉 8009/8010（技能同构，仅取 8009 参数；引擎双 id 共用）：
// 普攻/战技/终结技/天赋/秘技/欢愉技/行迹(欢愉万相★主角光环)
for (const id of ['800901', '800902', '800903', '800904', '800907', '800920', '800929']) out[id] = get('data/characters/8009.json', id, 'skill');
// 记忆开拓者 8007/8008（技能同构，仅取 8007 参数；引擎双 id 共用）：
// 普攻/战技/终结技/天赋/秘技/强化普攻 + 迷迷忆灵技/忆灵天赋/召唤时/消失时/我会！帮你！
// （800709 Restore 空参变体经用户裁定跳过；800706 迷宫普攻不进战斗）
for (const id of ['800701', '800702', '800703', '800704', '800707', '800708']) out[id] = get('data/characters/8007.json', id, 'skill');
for (const id of ['1800701', '1800703', '1800705', '1800706', '1800707']) out[id] = get('data/characters/8007.json', id, 'memo');
// 遐蝶 1407：普攻/战技(死龙替换版140709)/终结技/天赋/秘技 + 死龙忆灵技
for (const id of ['140701', '140702', '140703', '140704', '140707', '140709']) out[id] = get('data/characters/1407.json', id, 'skill');
for (const id of ['1140701', '1140702', '1140705', '1140706']) out[id] = get('data/characters/1407.json', id, 'memo');
// 风堇 1409：普攻/战技/终结技/天赋/秘技 + 小伊卡忆灵技
for (const id of ['140901', '140902', '140903', '140904', '140907']) out[id] = get('data/characters/1409.json', id, 'skill');
for (const id of ['1140901', '1140903', '1140905', '1140906']) out[id] = get('data/characters/1409.json', id, 'memo');
// 长夜月 1413：普攻/战技/终结技/天赋/秘技 + 长夜忆灵技
for (const id of ['141301', '141302', '141303', '141304', '141307', '141309']) out[id] = get('data/characters/1413.json', id, 'skill');
for (const id of ['1141301', '1141303', '1141305', '1141306', '1141307']) out[id] = get('data/characters/1413.json', id, 'memo');
// 昔涟 1415：普攻/战技/终结技/天赋/强化普攻/状态内终结技/秘技 + 德谬歌忆灵技(花与箭+14献予诗+等待/召唤/消失)
for (const id of ['141501', '141502', '141503', '141504', '141507', '141508', '141514']) out[id] = get('data/characters/1415.json', id, 'skill');
for (const id of ['1141501', '1141502', '1141503', '1141505', '1141513', '1141514', '1141515', '1141516', '1141517', '1141518', '1141519', '1141520', '1141521', '1141522', '1141523', '1141524', '1141525', '1141526']) out[id] = get('data/characters/1415.json', id, 'memo');
// 遐蝶 1407：普攻/战技/终结技/天赋/秘技/强化战技 + 死龙忆灵技
for (const id of ['140701', '140702', '140703', '140704', '140707', '140709']) out[id] = get('data/characters/1407.json', id, 'skill');
for (const id of ['1140701', '1140702', '1140705', '1140706']) out[id] = get('data/characters/1407.json', id, 'memo');
// 风堇 1409：普攻/战技/终结技/天赋/秘技 + 小伊卡忆灵技
for (const id of ['140901', '140902', '140903', '140904', '140907']) out[id] = get('data/characters/1409.json', id, 'skill');
for (const id of ['1140901', '1140903', '1140905', '1140906']) out[id] = get('data/characters/1409.json', id, 'memo');
// 长夜月 1413：普攻/战技/终结技/天赋/秘技 + 长夜忆灵技
for (const id of ['141301', '141302', '141303', '141304', '141307']) out[id] = get('data/characters/1413.json', id, 'skill');
for (const id of ['1141301', '1141303', '1141305', '1141306', '1141307']) out[id] = get('data/characters/1413.json', id, 'memo');
// 昔涟 1415：普攻/战技/终结技×2/天赋/秘技/强化普攻 + 德谬歌忆灵技与献予诗
for (const id of ['141501', '141502', '141503', '141504', '141507', '141508', '141514']) out[id] = get('data/characters/1415.json', id, 'skill');
for (const id of ['1141501', '1141502', '1141503', '1141505', '1141513', '1141514', '1141515', '1141517', '1141519', '1141522', '1141524', '1141525', '1141526']) out[id] = get('data/characters/1415.json', id, 'memo');
// 海瑟音 1410：普攻/战技/终结技/天赋/秘技（141006 MazeNormal 不进战斗）
for (const id of ['141001', '141002', '141003', '141004', '141007']) out[id] = get('data/characters/1410.json', id, 'skill');
// 黑天鹅 1307：普攻/战技/终结技/天赋/秘技（130706 MazeNormal 不进战斗）
for (const id of ['130701', '130702', '130703', '130704', '130707']) out[id] = get('data/characters/1307.json', id, 'skill');
// 卡芙卡 1005：普攻/战技/终结技/天赋/秘技（100506 MazeNormal 不进战斗）
for (const id of ['100501', '100502', '100503', '100504', '100507']) out[id] = get('data/characters/1005.json', id, 'skill');
// 银狼 1006：普攻/战技/终结技/天赋/秘技（100606 MazeNormal 不进战斗；基础字段已被 apply-1006-enhanced 覆写）
for (const id of ['100601', '100602', '100603', '100604', '100607']) out[id] = get('data/characters/1006.json', id, 'skill');
// 椒丘 1218：普攻/战技/终结技/天赋/秘技（121806 MazeNormal 不进战斗）
for (const id of ['121801', '121802', '121803', '121804', '121807']) out[id] = get('data/characters/1218.json', id, 'skill');
// 黄泉 1308：普攻/战技/终结技/天赋/秘技 + 终招子技能啼泽雨斩×3与黄泉返渡（130806 MazeNormal 不进战斗）
for (const id of ['130801', '130802', '130803', '130804', '130807', '130814', '130815', '130816', '130817']) out[id] = get('data/characters/1308.json', id, 'skill');
// 瓦尔特 1004：普攻/战技/终招/天赋/秘技（100406 MazeNormal 不进战斗）
for (const id of ['100401', '100402', '100403', '100404', '100407']) out[id] = get('data/characters/1004.json', id, 'skill');
// 佩拉 1106：普攻/战技/终招/天赋/秘技（110606 MazeNormal 不进战斗）
for (const id of ['110601', '110602', '110603', '110604', '110607']) out[id] = get('data/characters/1106.json', id, 'skill');
// 桑博 1108：普攻/战技/终招/天赋/秘技（110806 MazeNormal 不进战斗）
for (const id of ['110801', '110802', '110803', '110804', '110807']) out[id] = get('data/characters/1108.json', id, 'skill');
// 千冶•刃 1507：普攻×2/战技×2/结界终招/天赋/秘技/无量忿怒终招（150706 MazeNormal 不进战斗；150709=空文案战技变体一并进 raw 备查）
for (const id of ['150701', '150702', '150703', '150704', '150707', '150708', '150709', '150714']) out[id] = get('data/characters/1507.json', id, 'skill');
// 卢卡 1111：普攻/战技/终招/天赋/秘技/强化普攻直冲碎天拳（111106 MazeNormal 不进战斗）
for (const id of ['111101', '111102', '111103', '111104', '111107', '111108']) out[id] = get('data/characters/1111.json', id, 'skill');
// 桂乃芬 1210：普攻/战技/终招/天赋/秘技（121006 MazeNormal 不进战斗）
for (const id of ['121001', '121002', '121003', '121004', '121007']) out[id] = get('data/characters/1210.json', id, 'skill');
// 赛飞儿 1406：普攻/战技/终招/天赋/秘技（140606 MazeNormal 不进战斗）
for (const id of ['140601', '140602', '140603', '140604', '140607']) out[id] = get('data/characters/1406.json', id, 'skill');
// 大丽花 1321：普攻/战技/终招/天赋/秘技（132106 MazeNormal 不进战斗）
for (const id of ['132101', '132102', '132103', '132104', '132107']) out[id] = get('data/characters/1321.json', id, 'skill');
// 忘归人 1225：普攻/强化普攻/战技/终招/天赋/秘技（122506 MazeNormal 不进战斗）
for (const id of ['122501', '122502', '122503', '122504', '122507', '122508']) out[id] = get('data/characters/1225.json', id, 'skill');
// 大丽花 1321：普攻/战技/终招/天赋/秘技（132106 MazeNormal 不进战斗）
for (const id of ['132101', '132102', '132103', '132104', '132107']) out[id] = get('data/characters/1321.json', id, 'skill');
// 忘归人 1225：普攻/战技/终招/天赋/秘技/强化普攻（122506 MazeNormal 不进战斗）
for (const id of ['122501', '122502', '122503', '122504', '122507', '122508']) out[id] = get('data/characters/1225.json', id, 'skill');

// 艾丝妲 1009：普攻/战技/终结技/天赋/秘技（100906 MazeNormal 不进战斗）
for (const id of ['100901', '100902', '100903', '100904', '100907']) out[id] = get('data/characters/1009.json', id, 'skill');
// 布洛妮娅 1101：普攻/战技/终结技/天赋/秘技（110106 MazeNormal 不进战斗）
for (const id of ['110101', '110102', '110103', '110104', '110107']) out[id] = get('data/characters/1101.json', id, 'skill');
// 停云 1202：普攻/战技/终结技/天赋/秘技（120206 MazeNormal 不进战斗）
for (const id of ['120201', '120202', '120203', '120204', '120207']) out[id] = get('data/characters/1202.json', id, 'skill');
// 驭空 1207：普攻/战技/终结技/天赋/秘技（120706 MazeNormal 不进战斗）
for (const id of ['120701', '120702', '120703', '120704', '120707']) out[id] = get('data/characters/1207.json', id, 'skill');
// 寒鸦 1215：普攻/战技/终结技/天赋/秘技（121506 MazeNormal 不进战斗）
for (const id of ['121501', '121502', '121503', '121504', '121507']) out[id] = get('data/characters/1215.json', id, 'skill');

// 三月七 1001（存护）：普攻/战技/终结技/天赋/秘技（100106 MazeNormal 不进战斗）
for (const id of ['100101', '100102', '100103', '100104', '100107']) out[id] = get('data/characters/1001.json', id, 'skill');
// 杰帕德 1104：普攻/战技/终结技/天赋/秘技（110406 MazeNormal 不进战斗）
for (const id of ['110401', '110402', '110403', '110404', '110407']) out[id] = get('data/characters/1104.json', id, 'skill');
// 砂金 1304：普攻/战技/终结技/天赋/秘技（130406 MazeNormal 不进战斗）
for (const id of ['130401', '130402', '130403', '130404', '130407']) out[id] = get('data/characters/1304.json', id, 'skill');
// 符玄 1208（存护）：普攻/战技/终结技/天赋/秘技（120806 MazeNormal 不进战斗）
for (const id of ['120801', '120802', '120803', '120804', '120807']) out[id] = get('data/characters/1208.json', id, 'skill');
// 存护开拓者 8003（8004 同构，参数取 8003）：普攻/战技/终结技/天赋/秘技/强化普攻
// 800306、800406 为 MazeNormal/MazeAttack，不进战斗
for (const id of ['800301', '800302', '800303', '800304', '800307', '800308']) out[id] = get('data/characters/8003.json', id, 'skill');

// 刃 1205（加强版，基础字段已被 apply-1205-enhanced.mjs 覆写）：
// 普攻/战技/终结技/天赋/秘技/强化普攻（120506 MazeAttack 不进战斗）
for (const id of ['120501', '120502', '120503', '120504', '120506', '120507', '120508']) out[id] = get('data/characters/1205.json', id, 'skill');
// 镜流 1212（加强版，基础字段已被 apply-1212-enhanced.mjs 覆写）：
// 普攻/战技/终结技/天赋/秘技/强化战技（121206 MazeAttack 不进战斗）
for (const id of ['121201', '121202', '121203', '121204', '121206', '121207', '121209']) out[id] = get('data/characters/1212.json', id, 'skill');
// 万敌 1404：普攻/战技/终结技/天赋/秘技/弑王成王/弑神登神（140406 MazeAttack 不进战斗）
for (const id of ['140401', '140402', '140403', '140404', '140406', '140407', '140409', '140411']) out[id] = get('data/characters/1404.json', id, 'skill');

// Saber 1014：普攻/战技/终结技/天赋/秘技/强化普攻（101406 MazeNormal 不进战斗）
for (const id of ['101401', '101402', '101403', '101404', '101407', '101408']) out[id] = get('data/characters/1014.json', id, 'skill');
// 吉尔伽美什 1509：普攻/战技/终结技/天赋/追加攻击天赋/秘技（150906 MazeNormal、150909 空描述重复普攻不进战斗）
for (const id of ['150901', '150902', '150903', '150904', '150905', '150907']) out[id] = get('data/characters/1509.json', id, 'skill');
// 米沙 1312：普攻/战技/终结技/天赋/秘技（131206 MazeNormal 不进战斗）
for (const id of ['131201', '131202', '131203', '131204', '131207']) out[id] = get('data/characters/1312.json', id, 'skill');
// 流萤 1310（加强版，基础字段已被 apply-1310-enhanced.mjs 覆写）：
// 普攻/战技/终结技/天赋/秘技/强化普攻/强化战技（131006 MazeNormal 不进战斗）
for (const id of ['131001', '131002', '131003', '131004', '131006', '131007', '131008', '131009']) out[id] = get('data/characters/1310.json', id, 'skill');
// 雪衣 1214 / 云璃 1221 / 克拉拉 1107（基础版，无 enhanced）
for (const id of ['121401', '121402', '121403', '121404', '121406', '121407']) out[id] = get('data/characters/1214.json', id, 'skill');
for (const id of ['122101', '122102', '122103', '122104', '122106', '122107']) out[id] = get('data/characters/1221.json', id, 'skill');
for (const id of ['110701', '110702', '110703', '110704', '110706', '110707']) out[id] = get('data/characters/1107.json', id, 'skill');
// 阿兰 1008：普攻/战技/终结技/天赋/秘技（100806 MazeNormal 不进战斗）
for (const id of ['100801', '100802', '100803', '100804', '100807']) out[id] = get('data/characters/1008.json', id, 'skill');
// 虎克 1109：普攻/战技/终结技/天赋/秘技/强化战技（110906 MazeNormal 不进战斗）
for (const id of ['110901', '110902', '110903', '110904', '110907', '110909']) out[id] = get('data/characters/1109.json', id, 'skill');
// 毁灭开拓者 8001/8002（技能同构，仅取 8001 参数；引擎双 id 共用）：
// 普攻/战技/终结技/天赋/秘技/终结技单体/终结技扩散（800106 迷宫普攻不进战斗）
for (const id of ['800101', '800102', '800103', '800104', '800107', '800108', '800109']) out[id] = get('data/characters/8001.json', id, 'skill');
// 丹恒•饮月 1213：普攻/战技/终结技/天赋/秘技/三档强化普攻
for (const id of ['121301', '121302', '121303', '121304', '121307', '121308', '121310', '121312']) out[id] = get('data/characters/1213.json', id, 'skill');
// 白厄 1408：普攻/战技/终结技/天赋/卡厄斯兰那天赋/秘技/强化普攻/强化战技1/强化战技2（140806 MazeNormal 不进战斗）
for (const id of ['140801', '140802', '140803', '140804', '140805', '140807', '140808', '140809', '140811']) out[id] = get('data/characters/1408.json', id, 'skill');
// 真理医生 1305：普攻/战技/终结技/天赋/秘技（130506 MazeNormal 不进战斗）
for (const id of ['130501', '130502', '130503', '130504', '130507']) out[id] = get('data/characters/1305.json', id, 'skill');
// 托帕&账账 1112：普攻/战技/终结技/天赋/秘技（111206 MazeNormal 不进战斗）
for (const id of ['111201', '111202', '111203', '111204', '111207']) out[id] = get('data/characters/1112.json', id, 'skill');
// 素裳 1206：普攻/战技/终结技/天赋/秘技（120606 MazeAttack 不进战斗）
for (const id of ['120601', '120602', '120603', '120604', '120607']) out[id] = get('data/characters/1206.json', id, 'skill');
// 彦卿 1209：普攻/战技/终结技/天赋/秘技（120906 MazeAttack 不进战斗）
for (const id of ['120901', '120902', '120903', '120904', '120907']) out[id] = get('data/characters/1209.json', id, 'skill');
// 丹恒 1002：普攻/战技/终结技/天赋/秘技（100206 MazeAttack 不进战斗）
for (const id of ['100201', '100202', '100203', '100204', '100207']) out[id] = get('data/characters/1002.json', id, 'skill');
// 希儿 1102：普攻/战技/终结技/天赋/秘技（110206 MazeAttack 不进战斗）
for (const id of ['110201', '110202', '110203', '110204', '110207']) out[id] = get('data/characters/1102.json', id, 'skill');
// Archer 1015：普攻/战技/终结技/天赋/秘技（101506 MazeAttack 不进战斗；101509「结束」无 level 参数=非战斗技能）
for (const id of ['101501', '101502', '101503', '101504', '101507']) out[id] = get('data/characters/1015.json', id, 'skill');
// 波提欧 1315：普攻/战技/终结技/天赋/秘技/强化普攻（131506 MazeAttack 不进战斗）
for (const id of ['131501', '131502', '131503', '131504', '131507', '131508']) out[id] = get('data/characters/1315.json', id, 'skill');
// 飞霄 1220：普攻/战技/终结技/天赋/秘技/终结技子段×2（122006 MazeNormal 不进战斗；122014 与 122003 同参数但削韧 0，**不接**；122008/122009 为大招 6 次子段）
for (const id of ['122001', '122002', '122003', '122004', '122007', '122008', '122009']) out[id] = get('data/characters/1220.json', id, 'skill');
// 貊泽 1223：普攻/战技/终结技/天赋/秘技（122306 MazeNormal 不进战斗）
for (const id of ['122301', '122302', '122303', '122304', '122307']) out[id] = get('data/characters/1223.json', id, 'skill');
// 三月七（巡猎）1224：普攻/战技/终结技/天赋/秘技/强化普攻（122406 MazeNormal 不进战斗）
for (const id of ['122401', '122402', '122403', '122404', '122407', '122408']) out[id] = get('data/characters/1224.json', id, 'skill');
// 不死途 1504：普攻/战技/终结技/天赋/秘技（150406 MazeNormal 不进战斗）
for (const id of ['150401', '150402', '150403', '150404', '150407']) out[id] = get('data/characters/1504.json', id, 'skill');

fs.writeFileSync('packages/engine/src/combat/skill-raw.json', JSON.stringify(out), 'utf8');
console.log('raw entries:', Object.keys(out).join(','));
