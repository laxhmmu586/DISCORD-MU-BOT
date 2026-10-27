"""Inventory editable paragraphs without rebuilding the supplied Word template."""
import json
import zipfile
from pathlib import Path
from lxml import etree as E

folder=Path(__file__).resolve().parents[1]/'data/has-checklists'
root=E.fromstring(zipfile.ZipFile(folder/'emergency-procedure-notification.docx').read('word/document.xml'))
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
fields=[]
for index,paragraph in enumerate(root.findall('.//w:p',ns)):
    text=''.join(paragraph.xpath('.//w:t/text()',namespaces=ns))
    if text.strip():
        fields.append(dict(key='paragraph_'+str(index),index=index,label='Section '+str(len(fields)+1),value=text))
(folder/'emergency-fields.json').write_text(json.dumps(fields,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
