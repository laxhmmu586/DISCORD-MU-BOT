"""Prepare retained Word packages; run only with the four authorized blank sources.

Only document text slots change. Styles, drawings, headers, footers and page
geometry remain in the source package. No source documents are modified.
"""
import argparse
import copy
import json
import re
import zipfile
from pathlib import Path
from lxml import etree as E

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
OUT = Path(__file__).resolve().parents[1] / 'data/has-word-templates'


class Template:
    def __init__(self, source, kind, title, category):
        self.source, self.kind = Path(source), kind
        self.zip = zipfile.ZipFile(source)
        self.root = E.fromstring(self.zip.read('word/document.xml'))
        self.body = self.root.find('w:body', NS)
        self.fields = []
        self.spec = dict(kind=kind, title=title, category=category, fields=self.fields)

    def cell(self, table, row, col):
        return self.body[table].findall('w:tr', NS)[row].findall('w:tc', NS)[col]

    def slot(self, node, key, label, type='text', fallback='', pattern=None):
        field = dict(key=key, label=label, type=type, fallback=fallback,
                     maxLength=1500 if type == 'textarea' else 200)
        self.fields.append(field)
        marker = '{{' + key + '}}'
        # Replace across Word's split runs without changing any run formatting.
        if pattern:
            texts = node.findall('.//w:t', NS)
            joined = ''.join(t.text or '' for t in texts)
            match = re.search(pattern, joined)
            if not match:
                raise ValueError(f'{self.kind}: missing slot {key}')
            start, end = match.span()
            offset = 0
            for t in texts:
                value = t.text or ''
                a, b = max(0, start-offset), min(len(value), end-offset)
                if a < b:
                    t.text = value[:a] + (marker if offset <= start else '') + value[b:]
                offset += len(value)
        else:
            para = node if node.tag == '{'+W+'}p' else node.find('w:p', NS)
            if para is None:
                raise ValueError(f'{self.kind}: no paragraph for {key}')
            texts = para.findall('.//w:t', NS)
            if texts:
                texts[0].text = marker
                for t in texts[1:]:
                    t.text = ''
            else:
                run = E.SubElement(para, '{'+W+'}r')
                # Reuse the paragraph's existing run style if available.
                props = para.find('w:r/w:rPr', NS)
                # PAF's empty writing rows carry their font on the paragraph
                # mark. Incident's paragraph marks instead carry heading
                # formatting around floating tables; new response runs use
                # its existing document body style.
                if props is None and self.kind != 'investigation':
                    props = para.find('w:pPr/w:rPr', NS)
                if props is not None:
                    run.append(copy.deepcopy(props))
                E.SubElement(run, '{'+W+'}t').text = marker

    def save(self):
        OUT.mkdir(parents=True, exist_ok=True)
        for node in self.root.findall('.//w:t',NS):
            if '{{' in (node.text or ''):
                node.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
        xml = E.tostring(self.root, encoding='UTF-8', xml_declaration=True, standalone=True)
        with zipfile.ZipFile(OUT / (self.kind+'.docx'), 'w', zipfile.ZIP_DEFLATED) as target:
            for info in self.zip.infolist():
                # Source metadata can contain staff names; it is not form content.
                data = self.zip.read(info.filename)
                if info.filename == 'word/document.xml':
                    data = xml
                if info.filename == 'docProps/core.xml':
                    core = E.fromstring(data)
                    for node in core:
                        if E.QName(node).localname in ('creator', 'lastModifiedBy', 'title', 'subject', 'description', 'keywords'):
                            node.text = ''
                    data = E.tostring(core, encoding='UTF-8', xml_declaration=True, standalone=True)
                target.writestr(copy.copy(info), data)
        # A blank download uses the original body byte for byte except the
        # requested one-page Discussion layout. COS needs sample data cleared.
        if self.kind != 'cos':
            with zipfile.ZipFile(OUT / (self.kind+'-blank.docx'), 'w', zipfile.ZIP_DEFLATED) as target:
                prepared=zipfile.ZipFile(OUT / (self.kind+'.docx'))
                for info in self.zip.infolist():
                    data=prepared.read(info.filename) if info.filename=='docProps/core.xml' else self.zip.read(info.filename)
                    if info.filename=='word/document.xml' and hasattr(self,'blank_xml'):
                        data=self.blank_xml
                    target.writestr(copy.copy(info),data)
        return self.spec


def prepare(sources):
    specs = []
    t = Template(sources[0], 'investigation', 'Incident Investigation Report', 'Safety')
    for r, labels in enumerate([['Ref No.', 'Date of incident'], ['Station / Account', 'Incident Location'], ['Prepared by', 'Title'], ['Date', 'Date report closed']]):
        for c, label in enumerate(labels):
            t.slot(t.cell(0, r, c*2+1), f'detail_{r}_{c}', label, 'date' if label.startswith('Date') else 'text')
    for i, (p, label) in enumerate([(3, 'Summary of the Event (summarize the incident).'), (7, 'Immediate action taken.'), (10, 'Incident Investigation — Who, What, Where, When, Why.'), (14, 'Root cause. (In details)'), (17, 'Corrective action. (In details)'), (21, 'Preventative action plan. (In details)'), (24, 'Is a follow up required? Yes / No (explain)'), (27, '30 day follow up — effectiveness, date and reviewers')]):
        t.slot(t.body[p], f'narrative_{i}', label, 'textarea')
    specs.append(t.save())

    t = Template(sources[1], 'cos', 'COS — Change of Status Form', 'HR')
    for i, c in enumerate([0, 2, 4]):
        t.slot(t.cell(3, 0, c), f'status_{i}', ['Status change', 'Separation', 'Leave of absence'][i], 'checkbox')
    for key, table, row, col, label, typ in [
        ('notice',5,0,1,'Notice date','date'), ('effective',5,0,3,'Effective date','date'),
        ('name',5,1,1,'Name — Last, First','text'), ('employee',5,1,3,'Employee #','text'),
        ('department',7,0,1,'Department or Account','text'), ('location',7,0,3,'Location','text'),
        ('from',9,6,0,'Change from','textarea'), ('to',9,6,1,'Change to','textarea'),
        ('explanation',16,0,1,'Explanation','textarea'),
        ('start',18,0,1,'Leave start date','date'), ('end',18,0,3,'Leave end date','date'),
        ('last_day',20,0,1,'Last day worked','date'),
        ('manager',22,0,1,'Manager’s signature','text'), ('manager_date',22,0,3,'Manager date','date'),
        ('admin',24,0,1,'Admin signature','text'), ('admin_date',24,0,3,'Admin date','date')]:
        t.slot(t.cell(table,row,col), key, label, typ)
    for table, rows in [(9,range(5)), (15,range(8))]:
        for r in rows:
            cells = t.body[table].findall('w:tr',NS)[r].findall('w:tc',NS)
            for c in range(len(cells)-1):
                value = ''.join(cells[c].xpath('.//w:t/text()',namespaces=NS)).strip()
                label = ''.join(cells[c+1].xpath('.//w:t/text()',namespaces=NS)).strip()
                if value.lower() in ('', 'x') and label:
                    t.slot(cells[c],f'check_{table}_{r}_{c}', label, 'checkbox')
    for c, label in [(3,'Re-hirable'),(5,'May re-apply after 1 year'),(7,'Not Re-hirable')]:
        t.slot(t.cell(20,0,c),f'rehire_{c}',label,'checkbox')
    specs.append(t.save())

    t = Template(sources[2], 'paf', 'PAF — Progressive Action Form', 'HR')
    for c, label in [(1,'Employee Name'),(3,'Employee #'),(5,'Account')]:
        t.slot(t.cell(2,0,c),f'employee_{c}',label)
    t.slot(t.cell(4,0,1),'date','Date','date')
    for table in [7,9,11,31]:
        cells=t.body[table].findall('w:tr',NS)[0].findall('w:tc',NS)
        for c in range(len(cells)-1):
            value=''.join(cells[c].xpath('.//w:t/text()',namespaces=NS)).strip()
            label=''.join(cells[c+1].xpath('.//w:t/text()',namespaces=NS)).strip()
            if not value and label:
                t.slot(cells[c],f'check_{table}_{c}',label,'checkbox')
    for table,label in [(14,'Description of event(s)'),(17,'Company Policy'),(21,'How does it affect the company?'),(25,'What is the action plan?'),(29,'What is the time frame for action plan?'),(37,'Employee Comments')]:
        t.slot(t.cell(table,0,0),f'narrative_{table}',label,'textarea')
        field=t.fields[-1]
        field['slots']=[field['key']]
        for row in range(1,len(t.body[table].findall('w:tr',NS))):
            alias=field['key']+'_line'+str(row)
            t.slot(t.cell(table,row,0),alias,label,'textarea')
            t.fields.pop()
            field['slots'].append(alias)
    t.slot(t.cell(33,0,1),'follow_date','Date of follow up','date')
    for table, cols in [(40,[(1,'Employee Signature'),(3,'Employee signature date'),(5,'Management Signature'),(7,'Management signature date')]),(43,[(1,'Witness Signature'),(3,'Witness signature date')])]:
        for c,label in cols:
            t.slot(t.cell(table,0,c),f'sign_{table}_{c}',label,'date' if 'date' in label else 'text')
    specs.append(t.save())

    t = Template(sources[3], 'discussion', 'Record of Discussion', 'HR')
    # Requested exception to source fidelity: keep the discussion form on one
    # page, including the witness signature, without removing any field.
    t.body[-1].find('w:pgMar',NS).set('{'+W+'}bottom','720')
    title_spacing=t.body[1].find('w:pPr/w:spacing',NS)
    title_spacing.set('{'+W+'}before','120')
    title_spacing.set('{'+W+'}after','180')
    for p in [2,3,4,5,6]:
        spacing=t.body[p].find('w:pPr/w:spacing',NS)
        spacing.set('{'+W+'}line','300')
    t.blank_xml=E.tostring(t.root,encoding='UTF-8',xml_declaration=True,standalone=True)
    for p, labels in [(2,['Employee Name','Employee ID','Department']),(3,['Location','Account','Manager’s name']),(4,['Date of Discussion']),(12,['Employee Signature','Employee signature date']),(13,['Supervisor/Manager name','Supervisor/Manager signature','Supervisor/Manager date']),(15,['Witness name','Witness signature','Witness date'])]:
        for i,label in enumerate(labels):
            text=''.join(t.body[p].xpath('.//w:t/text()',namespaces=NS))
            match=re.search('_{2,}',text)
            t.slot(t.body[p],f'detail_{p}_{i}',label,'date' if 'date' in label.lower() or label.startswith('Date') else 'text',fallback=match.group(),pattern='_{2,}')
    for i,label in enumerate(['Performance','Conduct/Behavior','Safety Concern','Attendance','Grooming','Policy Violation','Follow up','Other']):
        t.slot(t.body[6],f'purpose_{i}',label,'checkbox',fallback='☐',pattern='☐')
    t.slot(t.body[6],'other','Other purpose',fallback='__________________________',pattern='_{2,}')
    # Word stores the same floating text box in DrawingML and its VML fallback.
    for i, box in enumerate(t.body[8].findall('.//w:txbxContent',NS)):
        if i == 0:
            t.slot(box,'summary','Summary of Discussion','textarea')
        else:
            para=box.find('w:p',NS)
            E.SubElement(E.SubElement(para,'{'+W+'}r'),'{'+W+'}t').text='{{summary}}'
    t.slot(t.body[10],'comments','Employee Comments','textarea',fallback='_'*252,pattern='_{2,}')
    specs.append(t.save())
    (OUT/'forms.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources',nargs=4,help='Incident DOCX, COS DOCX, converted blank PAF DOCX, Discussion DOCX')
    prepare(parser.parse_args().sources)
