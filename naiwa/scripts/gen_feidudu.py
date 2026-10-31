# -*- coding: utf-8 -*-
# 用微软 Edge 朗读引擎（edge-tts）合成“你的胆子真是肥嘟嘟的”——外国人口音版
# 做法：让英语声音念一串按英语拼读写出来的中文（Nee duh dahn-zuh...），出来就是老外说中文的味道；
#       另外也让“多语言”英语声音直接念中文汉字，口音轻一点、字更清楚，做对比。
# 用法：python gen_feidudu.py   输出到 .build/dl/feidudu/，日志 gen_feidudu.log
import asyncio, sys, traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'pylib'))
import edge_tts  # noqa: E402

OUT = HERE / 'dl' / 'feidudu'
OUT.mkdir(parents=True, exist_ok=True)
LOG = HERE / 'gen_feidudu.log'

PHONETIC = 'Nee duh dahn-zuh, jen shur, fay doo doo duh!'
ECHO = 'Fay doo doo!'
CHINESE = '你的胆子，真是肥嘟嘟的！'
JOBS = [
    # 文件名, 声音, 文本, 语速, 音高
    ('guy', 'en-US-GuyNeural', PHONETIC, '+0%', '+0Hz'),
    ('christopher', 'en-US-ChristopherNeural', PHONETIC, '+0%', '+0Hz'),
    ('andrew', 'en-US-AndrewNeural', PHONETIC, '+0%', '+0Hz'),
    ('jenny', 'en-US-JennyNeural', PHONETIC, '+0%', '+0Hz'),
    ('ava-ml-zh', 'en-US-AvaMultilingualNeural', CHINESE, '+0%', '+0Hz'),
    ('andrew-ml-zh', 'en-US-AndrewMultilingualNeural', CHINESE, '+0%', '+0Hz'),
    ('guy-echo', 'en-US-GuyNeural', ECHO, '+10%', '+25Hz'),
]


async def main():
    lines = []
    try:
        voices = await edge_tts.list_voices()
        names = {v['ShortName'] for v in voices}
        lines.append('voices %d; ml: %s' % (len(voices), ', '.join(sorted(n for n in names if 'Multilingual' in n and n.startswith('en-US')))))
    except Exception as e:  # 列表拿不到也照样试着合成
        names = None
        lines.append('list_voices fail ' + repr(e))
    for name, voice, text, rate, pitch in JOBS:
        if names is not None and voice not in names:
            lines.append('skip %s（没有这个声音 %s）' % (name, voice))
            continue
        out = OUT / (name + '.mp3')
        try:
            await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(str(out))
            lines.append('ok %s %s %d 字节' % (name, voice, out.stat().st_size))
        except Exception:
            lines.append('fail %s %s\n%s' % (name, voice, traceback.format_exc()))
        LOG.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    lines.append('DONE')
    LOG.write_text('\n'.join(lines) + '\n', encoding='utf-8')

asyncio.run(main())
