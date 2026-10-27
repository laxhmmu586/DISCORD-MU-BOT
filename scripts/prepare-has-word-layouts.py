"""Derive browser form structure from the retained, sanitized Word templates.

The JSON is declarative data, never HTML or script. Source tables, merged cells,
paragraph order, text styling and logos are retained rather than reorganizing
the fields into an unrelated questionnaire.
"""
import json
import re
import zipfile
from pathlib import Path
from lxml import etree as E

ROOT=Path(__file__).resolve().parents[1]
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS={'w':W,'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def val(node,name='val',default=None):
    return node.get('{'+W+'}'+name,default) if node is not None else default
def css_point(value):
    return str(round(int(value)/20,2))+'pt'
def border_css(edge):
    if val(edge) in ['nil','none']:return '0'
    color=val(edge,'color','333333')
    return '1px solid #'+(color if re.fullmatch('[0-9A-Fa-f]{6}',color) else '333333')
def node(tag,children=None,style=None,**attrs):
    return dict(tag=tag,children=children or [],style=style or {},**attrs)

def build(kind,definition):
    package=zipfile.ZipFile(ROOT/'data/has-word-templates'/f'{kind}.docx')
    document=E.fromstring(package.read('word/document.xml'))
    body=document.find('w:body',NS)
    rels=E.fromstring(package.read('word/_rels/document.xml.rels'))
    images={}
    assets=ROOT/'public/public/assets/report-templates'
    assets.mkdir(parents=True,exist_ok=True)
    for rel in rels:
        target=rel.get('Target','')
        if target.startswith('media/') and Path(target).suffix.lower() in ['.png','.jpg','.jpeg']:
            name=kind+'-'+Path(target).name
            (assets/name).write_bytes(package.read('word/'+target))
            images[rel.get('Id')]='/assets/report-templates/'+name
    fields={f['key']:f for f in definition['fields']}
    aliases={alias:f['key'] for f in fields.values() for alias in f.get('slots',[])}
    seen=set()
    def field(key):
        key=aliases.get(key,key)
        if key in seen or key not in fields or fields[key].get('printOnly'):
            return []
        seen.add(key)
        return [dict(field=key)]
    def runs(paragraph):
        result=[]
        for run in paragraph.findall('.//w:r',NS):
            # Text-box content is rendered once as a separate response area.
            if any(E.QName(parent).localname=='txbxContent' for parent in run.iterancestors()):
                continue
            style={}
            props=run.find('w:rPr',NS)
            if props is not None:
                font=props.find('w:rFonts',NS)
                if font is not None:style['fontFamily']=font.get('{'+W+'}ascii','Arial')+', Arial, sans-serif'
                size=val(props.find('w:sz',NS))
                if size:style['fontSize']=str(int(size)/2)+'pt'
                if props.find('w:b',NS) is not None and val(props.find('w:b',NS))!='0':style['fontWeight']='bold'
                if props.find('w:i',NS) is not None:style['fontStyle']='italic'
                color=val(props.find('w:color',NS))
                if color and re.fullmatch('[0-9A-Fa-f]{6}',color):style['color']='#'+color
            children=[]
            for part in run:
                tag=E.QName(part).localname
                if tag=='t':
                    for token in re.split(r'(\{\{[a-z0-9_]+\}\})',part.text or ''):
                        if token.startswith('{{') and token.endswith('}}'):children.extend(field(token[2:-2]))
                        elif token:children.append(token)
                elif tag=='tab':children.append(node('span',['\u2003'],className='template-tab'))
                elif tag=='br':children.append(node('br'))
                elif tag=='drawing':
                    for blip in part.findall('.//a:blip',NS):
                        src=images.get(blip.get('{'+NS['r']+'}embed'))
                        if src:children.append(node('img',src=src,alt='Hallmark Aviation Services',className='template-logo'))
            if children:result.append(node('span',children,style))
        return result
    def paragraph(p):
        style={}
        props=p.find('w:pPr',NS)
        if props is not None:
            align=val(props.find('w:jc',NS))
            if align in ['center','left','right']:style['textAlign']=align
            spacing=props.find('w:spacing',NS)
            if spacing is not None:
                for attr,css in [('before','marginTop'),('after','marginBottom')]:
                    value=val(spacing,attr)
                    if value:style[css]=css_point(value)
        return node('p',runs(p),style)
    def table(tbl):
        grid=[int(val(c,'w',0)) for c in tbl.findall('w:tblGrid/w:gridCol',NS)]
        total=sum(grid) or 1
        result=node('table',className='template-table')
        table_borders={E.QName(edge).localname:border_css(edge) for edge in tbl.findall('w:tblPr/w:tblBorders/*',NS)}
        for side in ['top','bottom','left','right']:
            if side in table_borders:result['style']['border'+side.title()]=table_borders[side]
        if grid:result['children'].append(node('colgroup',[node('col',style={'width':str(w/total*100)+'%'}) for w in grid]))
        rows=[]
        active={}
        for tr in tbl.findall('w:tr',NS):
            row=node('tr');column=0
            for cell in tr.findall('w:tc',NS):
                props=cell.find('w:tcPr',NS)
                span=int(val(props.find('w:gridSpan',NS),'val',1)) if props is not None else 1
                merge=props.find('w:vMerge',NS) if props is not None else None
                if merge is not None and val(merge)!='restart' and column in active:
                    active[column]['rowSpan']=active[column].get('rowSpan',1)+1
                    column+=span
                    continue
                td=node('td',colSpan=span)
                for side,inside in [('top','insideH'),('bottom','insideH'),('left','insideV'),('right','insideV')]:
                    if inside in table_borders:td['style']['border'+side.title()]=table_borders[inside]
                if merge is not None:active[column]=td
                else:active.pop(column,None)
                if props is not None:
                    fill=val(props.find('w:shd',NS),'fill')
                    if fill and re.fullmatch('[0-9A-Fa-f]{6}',fill):td['style']['backgroundColor']='#'+fill
                    borders=props.find('w:tcBorders',NS)
                    if borders is not None:
                        for edge in borders:
                            side={'start':'left','end':'right'}.get(E.QName(edge).localname,E.QName(edge).localname)
                            if side in ['top','bottom','left','right']:
                                td['style']['border'+side.title()]=border_css(edge)
                for child in cell:
                    if child.tag=='{'+W+'}p':td['children'].append(paragraph(child))
                    elif child.tag=='{'+W+'}tbl':td['children'].append(table(child))
                row['children'].append(td);column+=span
            rows.append(row)
        result['children'].append(node('tbody',rows))
        return result
    blocks=[]
    for index,part in enumerate(body):
        if kind=='discussion' and index>=12:continue
        if kind=='paf' and index in [40,41,42,43,44,45]:continue
        if kind=='paf' and index in [14,17,21,25,29,37]:
            key='narrative_'+str(index)
            blocks.append(node('div',field(key),className='template-writing',style={'minHeight':str(len(part.findall('w:tr',NS))*26)+'px'}))
            continue
        if kind=='cos' and index in [11,12,13]:
            if index==11:
                blocks.append(node('div',[
                    node('strong',['Separation Reason (SELECT ONLY ONE BOX)'],className='cos-separation-title'),node('strong',['Leave of Absence']),
                    node('div',['Voluntary Resignation:',node('small',['(Attach Resignation Letter)'])]),
                    node('div',['Involuntary Termination:',node('small',['(Attach copies of performance notices.)'])]),
                    node('div',['Require HR Approval:',node('small',['(Attach supporting docs)'])])],className='cos-separation-headings'))
            continue
        if part.tag=='{'+W+'}tbl':
            block=table(part)
            block['className']+=' template-table-'+str(index)
            if kind=='paf' and index in [7,9,11,31]:block['className']+=' paf-options'
            blocks.append(block)
        elif part.tag=='{'+W+'}p':
            block=paragraph(part)
            if kind=='cos' and index==6:block['className']='cos-name-hint'
            if block['children']:blocks.append(block)
            if kind=='discussion' and index==8:
                blocks.append(node('div',field('summary'),className='discussion-summary-box'))
    # PAF keeps its logo in the Word header rather than document.xml.
    if kind=='paf':
        for name in package.namelist():
            if re.fullmatch('word/_rels/header[0-9]+.xml.rels',name):
                for rel in E.fromstring(package.read(name)):
                    target=rel.get('Target','')
                    if target.startswith('media/') and Path(target).suffix.lower() in ['.png','.jpg','.jpeg']:
                        image_name=kind+'-'+Path(target).name
                        (assets/image_name).write_bytes(package.read('word/'+target))
                        blocks.insert(0,node('p',[node('img',src='/assets/report-templates/'+image_name,alt='Hallmark Aviation Services',className='template-logo')],style={'textAlign':'center'}))
                        break
    missing=[key for key,f in fields.items() if key not in seen and not f.get('printOnly')]
    if missing:raise ValueError(kind+': unmapped browser fields '+','.join(missing))
    return blocks

if __name__=='__main__':
    definitions=json.loads((ROOT/'data/has-word-templates/forms.json').read_text(encoding='utf-8'))
    layouts={f['kind']:build(f['kind'],f) for f in definitions if f['category']=='HR'}
    (ROOT/'data/has-word-templates/layouts.json').write_text(json.dumps(layouts,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
