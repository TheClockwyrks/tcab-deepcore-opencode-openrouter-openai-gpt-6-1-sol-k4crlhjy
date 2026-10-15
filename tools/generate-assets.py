"""One-time asset authoring. Requires the six authoring CLIs, never used by Vite.

All shapes below are original Deepcore artwork. Logs are fed to draw/draw-sheet;
audio and live effects are authored through their tools' operations.
"""
import json
import math
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = Path('/tmp/opencode/deepcore-authoring')
TMP.mkdir(parents=True, exist_ok=True)
random.seed(71026)


def run(*args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout


class Art:
    def __init__(self, w=80, h=80):
        self.w, self.h, self.ops = w, h, []

    def rect(self, x, y, w, h, c):
        self.ops.append(dict(op='fill_rect', x=int(x), y=int(y), width=max(1, int(w)), height=max(1, int(h)), color=c))

    def line(self, x1, y1, x2, y2, c):
        self.ops.append(dict(op='line', x0=int(x1), y0=int(y1), x1=int(x2), y1=int(y2), color=c))

    def disc(self, x, y, r, c):
        self.ops.append(dict(op='fill_circle', cx=int(x), cy=int(y), r=int(r), color=c))

    def poly(self, pts, c):
        for y in range(max(0, int(min(p[1] for p in pts))), min(self.h, int(max(p[1] for p in pts)) + 1)):
            xs = []
            for a, b in zip(pts, pts[1:] + pts[:1]):
                if min(a[1], b[1]) <= y < max(a[1], b[1]):
                    xs.append(a[0] + (y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
            xs.sort()
            for i in range(0, len(xs)-1, 2):
                self.rect(round(xs[i]), y, round(xs[i+1])-round(xs[i])+1, 1, c)

    def save(self, path, sheet=False):
        dest = ROOT / 'assets' / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        log = TMP / 'art.json'
        log.write_text(json.dumps(self.ops))
        run('draw-sheet' if sheet else 'draw', 'render', '--actions', log, '--out', dest, '--width', self.w, '--height', self.h, '--no-layers')


def rock():
    palettes = {
        'topsoil': ['#584536', '#654f3c', '#745b43', '#44362d', '#8c6a49'],
        'rockbed': ['#3d4a50', '#45545b', '#53626a', '#2c383e', '#69757a'],
        'deepstone': ['#292f3d', '#32384a', '#3b4355', '#202632', '#4b5263'],
        'coreshell': ['#492f36', '#58353b', '#643c3d', '#36262f', '#7e4942'],
    }
    for band, p in palettes.items():
        for n in range(3):
            a = Art()
            a.rect(0, 0, 80, 80, p[0])
            for _ in range(850):
                x, y = random.randrange(80), random.randrange(80)
                a.rect(x, y, random.choice([1, 1, 2, 3, 4]), 1, random.choice(p[1:]))
            for _ in range(12):
                x, y = random.randrange(80), random.randrange(80)
                a.line(x, y, x+random.randrange(5, 18), y+random.randrange(-3, 4), p[3])
            a.save(f'tiles/{band}-{n}.png')
    a = Art()
    a.rect(0, 0, 80, 80, '#171e27')
    for i in range(0, 80, 10):
        a.line(0, i, 80, i+30, '#29323d')
        a.line(i, 0, i-30, 80, '#10171e')
    a.save('tiles/bedrock.png')
    for n in range(2):
        a = Art()
        a.poly([(0, 14), (20, 1), (66, 4), (79, 26), (74, 66), (52, 78), (11, 70)], '#15232d')
        a.poly([(5, 18), (23, 6), (63, 9), (73, 29), (67, 61), (50, 71), (15, 65)], '#687781')
        a.poly([(8, 20), (25, 9), (61, 12), (69, 26), (27, 33)], '#89969a')
        a.poly([(27, 34), (70, 28), (65, 60), (50, 68), (23, 61)], '#4d606d')
        a.line(19, 25+n*9, 56, 17+n*9, '#b3bdb6')
        a.line(14, 55, 36, 65, '#3a4a59')
        a.save(f'tiles/stone-{n}.png')
    a = Art()
    a.rect(0, 0, 80, 80, '#11191f')
    for _ in range(500):
        a.rect(random.randrange(80), random.randrange(80), 1, 1, random.choice(['#172127', '#1b252a', '#10171d']))
    a.save('tiles/tunnel.png')
    for f in range(4):
        a = Art()
        for j in range(3 + f*3):
            ang = j*2.399
            length = 13 + f*7 + (j%3)*3
            x, y = 40+math.cos(ang)*length, 40+math.sin(ang)*length
            a.line(39, 40, x, y, '#12191fc0')
            a.line(41, 40, x+1, y, '#d4c4a750')
            if f > 1:
                a.line(x, y, x+math.sin(ang)*9, y+math.cos(ang)*7, '#12191fdd')
        a.save(f'tiles/crack/frame{f:02}.png', True)


ORE_COLORS = ['#bfaa89', '#e7ba65', '#da8552', '#d0e2df', '#699ed5', '#9edcb2', '#c9a9ed', '#edaa49', '#ef7271', '#b7f5eb', '#65deab', '#f296bf', '#ffd986']
ORE_NAMES = ['ferron', 'marlite', 'cuprite', 'argenite', 'cobaltine', 'voltite', 'halcite', 'pyronium', 'cindrite', 'adamite', 'verdite', 'roselite', 'aurite']


def minerals():
    for i, (name, color) in enumerate(zip(ORE_NAMES, ORE_COLORS)):
        a = Art()
        if i < 10:
            for _ in range(330):
                x = random.randrange(80)
                mid = 41 + math.sin(x/16)*9
                y = round(random.gauss(mid, 7))
                a.rect(x, y, random.randrange(1, 6), random.choice([1, 2, 3]), color + random.choice(['55', '88', 'bb', 'ff']))
            for x in range(0, 80, 4):
                y = 40+int(math.sin(x/16)*9)
                a.line(x, y, x+4, y+1, color)
                if x%12 == 0:
                    a.rect(x, y-3, 3, 2, '#fff0ccbb')
        else:
            a.poly([(16, 30), (29, 16), (54, 16), (67, 31), (40, 66)], '#112d34')
            a.poly([(20, 30), (31, 20), (52, 20), (63, 31), (40, 60)], color)
            a.poly([(20, 31), (33, 32), (40, 60)], '#336a7188')
            a.poly([(33, 32), (48, 32), (40, 60)], '#ffffff88')
            a.poly([(48, 32), (63, 31), (40, 60)], '#14344288')
            a.poly([(31, 21), (52, 21), (48, 30), (33, 30)], '#ffffffaa')
            a.line(23, 18, 23, 34, '#fff7dc')
            a.line(15, 26, 31, 26, '#fff7dc')
        a.save(f'ore/{name}.png')
    for name, color in [('resonite', '#a5efc0'), ('cryenite', '#a7caff'), ('core', '#ff8c49'), ('core-sample', '#ffba63')]:
        a = Art()
        for r in range(35, 10, -4):
            a.disc(40, 41, r, color+'0c')
        if name.startswith('core'):
            a.disc(40, 40, 24, '#362a31')
            a.disc(40, 40, 21, color)
            a.disc(37, 36, 15, '#ffe5a6')
            a.poly([(22, 50), (34, 24), (41, 54), (52, 20), (60, 46)], '#fff8d4')
            a.line(16, 41, 63, 41, '#d9693d')
        else:
            for x, y, w, h in [(17, 35, 13, 24), (30, 17, 17, 45), (47, 28, 15, 32)]:
                a.poly([(x, y+6), (x+w/2, y), (x+w, y+7), (x+w-2, y+h), (x+2, y+h+4)], color)
                a.poly([(x+2, y+8), (x+w/2, y+2), (x+w/2, y+h)], '#ffffff88')
                a.line(x+w-2, y+9, x+w-3, y+h-2, '#325e8188')
            a.line(39, 10, 39, 24, '#effff0')
            a.line(32, 17, 46, 17, '#effff0')
        a.save(f'materials/{name}.png')
    for f in range(4):
        a = Art()
        a.rect(0, 0, 80, 80, '#8f3534')
        for y in range(0, 80, 2):
            for x in range(0, 80, 2):
                z = math.sin(x/80*math.tau*2+f*math.tau/4+math.sin(y/80*math.tau))*math.cos(y/80*math.tau+f*math.tau/4)
                c = '#ffdc83' if z > .65 else '#ffad50' if z > .2 else '#ec6d3b' if z > -.4 else '#b83e37'
                a.rect(x, y, 2, 2, c)
        a.save(f'hazards/lava/frame{f:02}.png', True)


def miner():
    states = {'idle': 4, 'walk': 6, 'drill-down': 4, 'drill-side': 4, 'jetpack': 4, 'fall': 4, 'hurt': 3, 'fuel-out': 3}
    for state, frames in states.items():
        for f in range(frames):
            a = Art()
            bob = (f%2) if state in ['idle', 'walk'] else (-1 if f%2 else 1)
            if state == 'hurt': bob += 3-f*2
            if state == 'fuel-out': bob += 4
            ox = -3 if state == 'hurt' and f == 0 else 0
            oy = bob
            def r(x,y,w,h,c): a.rect(x+ox,y+oy,w,h,c)
            def p(pts,c): a.poly([(x+ox,y+oy) for x,y in pts],c)
            def d(x,y,rad,c): a.disc(x+ox,y+oy,rad,c)
            ink, dark, amber, light = '#101f2a', '#334552', '#e4a653', '#e4dcc0'
            # Backpack, twin fuel cylinders, cable and nozzle.
            r(12,30,16,30,ink); r(14,32,11,24,'#637c7e'); r(14,33,4,21,'#9cb1a3')
            r(12,38,14,4,dark); r(14,55,9,8,dark); r(15,60,7,4,ink)
            if state == 'jetpack':
                p([(14,63),(24,63),(22,75-f%2*5),(19,79),(15,71)], '#f1aa53')
                p([(17,63),(22,63),(20,74-f%3*2)], '#fff2a8')
            # Legs are deliberately separate articulated shapes.
            stride = [0,5,7,0,-5,-7][f%6] if state == 'walk' else 0
            if state in ['fall','jetpack']: stride = 5+f%2*2
            r(28-stride//2,52,12,17,ink); r(30-stride//2,52,8,13,'#89988b')
            r(26-stride//2,67,16,7,ink); r(29-stride//2,67,12,3,dark)
            r(43+stride//2,52,12,17,ink); r(45+stride//2,52,8,13,light)
            r(43+stride//2,67,16,7,ink); r(46+stride//2,67,12,3,'#73847d')
            # Torso: broad shoulder, orange utility suit, contrast chest plate.
            p([(26,29),(48,27),(57,37),(54,56),(28,57),(23,43)],ink)
            p([(28,32),(47,30),(53,39),(50,53),(30,54),(27,43)],amber)
            r(29,33,12,17,light); r(31,34,8,5,'#faf0cf'); r(32,42,6,5,dark)
            r(42,39,9,3,'#bb743f'); r(29,51,24,5,dark); r(35,52,5,3,'#c7d4b8')
            # Helmet with metal rim, directional glass and lamp.
            d(39,21,17,ink); d(39,20,14,light)
            p([(27,17),(33,10),(48,11),(53,17),(52,27),(33,28),(27,24)], '#f2e4bd')
            r(33,17,22,12,ink); r(35,18,18,8,'#386577'); r(36,18,15,3,'#85c4bd')
            r(47,21,5,4,'#213d50'); r(30,29,20,3,dark)
            r(45,8,10,8,ink); r(47,9,7,5,'#ffe4a1' if f%2 == 0 else '#fff3bd')
            r(25,18,7,10,'#8a9a8b'); r(27,20,3,5,'#4c6267')
            # Gloves / handheld rotary drill, changed by activity.
            if state == 'drill-down':
                r(48,39,11,15,ink); r(50,40,7,11,light)
                r(42,49,15,15,ink); r(44,50,11,12,'#728b85')
                p([(43,63),(56,63),(50+(f%2),78)], '#b7c4b3')
                for y in range(64,74,3): a.line(44,y+oy,54,y+oy,'#3b5663')
            else:
                dy = -5 if state == 'drill-side' else (f%2*2 if state == 'walk' else 0)
                r(47,37+dy,16,12,ink); r(49,38+dy,11,8,light)
                r(56,43+dy,13,12,ink); r(58,44+dy,9,8,'#6e8685')
                p([(68,43+dy),(79,49+dy),(68,55+dy)], '#bac5b0')
                for x in range(68,77,3): a.line(x,44+dy+oy,x,53+dy+oy,'#3c5663')
            r(24,38,7,13,ink); r(25,39,5,9,'#aeb5a0')
            if state == 'hurt': r(35,19,14,2,'#e9f0c7')
            if state == 'fuel-out': r(46,9,7,4,'#8d7e63')
            a.save(f'miner/{state}/frame{f:02}.png', True)


def surface():
    a = Art(1280,720)
    for y in range(720):
        t=y/720
        a.rect(0,y,1280,1,'#%02x%02x%02x'%(int(12+16*t),int(24+17*t),int(34+17*t)))
    for _ in range(260):
        x,y=random.randrange(1280),random.randrange(520)
        a.rect(x,y,random.choice([1,1,2]),1,random.choice(['#849c9c','#465c68','#b4b9a1']))
    for r in range(83,0,-1):
        c = '#%02x%02x%02x'%(70+int((83-r)*.3),83+int((83-r)*.3),84+int((83-r)*.23))
        a.disc(1015,160,r,c)
    a.disc(1046,143,72,'#162b37')
    for layer,c in [(0,'#253b43'),(1,'#20333c'),(2,'#152a34')]:
        pts=[(0,720)]
        for x in range(0,1320,40): pts.append((x,535+layer*48+random.randrange(-45,30)))
        pts.append((1280,720)); a.poly(pts,c)
    a.save('surface/sky.png')
    a = Art(320,80)
    a.rect(0,0,320,80,'#3c4140'); a.rect(0,0,320,5,'#839080')
    for x in range(0,320,40):
        a.rect(x,8,38,12,'#545b53'); a.line(x,24,x+39,24,'#252f32')
        a.rect(x+8,3,2,3,'#b7b69b')
    for _ in range(400): a.rect(random.randrange(320),random.randrange(28,80),2,1,random.choice(['#4c4e44','#282f32','#686255']))
    a.save('surface/ground.png')
    a=Art(80,80)
    a.poly([(0,80),(0,25),(10,8),(23,0),(60,0),(77,19),(80,80)],'#17232c')
    a.poly([(10,80),(10,24),(21,10),(59,10),(69,24),(69,80)],'#0b151e')
    a.rect(9,15,5,55,'#889482');a.rect(65,15,5,55,'#889482');a.rect(14,10,51,5,'#c9bd8a')
    for x in range(14,65,10):a.rect(x,10,5,5,'#c68747')
    a.save('surface/cave-mouth.png')
    ids=['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']
    for idx,name in enumerate(ids):
        a=Art(240,180)
        a.rect(7,165,227,15,'#131f27');a.rect(13,161,215,7,'#8b907a')
        if name == 'launch-pad':
            a.rect(20,149,200,12,'#5d706a')
            for x in [28,200]:
                a.rect(x,23,10,128,'#3e5661');a.rect(x+2,26,3,120,'#7c9189')
                for y in range(35,145,25): a.line(x,y,x+29 if x==28 else x-24,y+21,'#637c79')
            a.rect(30,24,180,7,'#869583');a.rect(25,20,190,4,'#b3b599')
        elif name == 'save-pad':
            a.poly([(30,162),(43,143),(193,143),(210,162)],'#5c716c')
            a.rect(94,58,52,89,'#152b35');a.rect(99,62,42,61,'#6b827d')
            a.rect(103,67,34,43,'#263f4b');a.rect(109,74,23,25,'#89d7bb')
            for y in range(78,97,5):a.rect(114,y,14,2,'#335e61')
            a.rect(107,115,26,7,'#d1bb78');a.rect(106,130,29,5,'#9ae7c3')
            for x in range(46,193,16): a.rect(x,147,8,3,'#ace6be')
        else:
            a.poly([(19,161),(19,73),(34,50),(192,50),(218,74),(218,161)],'#142832')
            a.rect(25,77,187,82,'#52625d');a.rect(29,81,177,73,'#394a4c')
            a.poly([(13,75),(33,43),(193,43),(225,75)],'#637a75')
            a.line(18,72,220,72,'#a0ab90');a.rect(38,47,151,7,'#8b9580')
            a.rect(36,89,73,47,'#182e3b');a.rect(40,93,65,35,'#466a72')
            a.rect(43,95,59,4,'#a4c4ac');a.rect(73,94,3,33,'#203d4a')
            a.rect(124,85,49,75,'#20313b');a.rect(129,91,39,64,'#637772')
            a.rect(133,96,31,24,'#283e4a');a.rect(158,131,4,6,'#deb871')
            a.rect(180,91,21,43,'#8c8f76')
            for y in range(96,132,6):a.rect(182,y,17,2,'#344d55')
            a.rect(30,144,78,6,'#ba995b')
            for x in range(32,108,12):a.rect(x,145,5,4,'#22363d')
            if name=='fuel-depot':
                for x in [1,194]:
                    a.disc(x+15,103,14,'#1b313c');a.rect(x+1,103,28,52,'#bf8052')
                    a.rect(x+4,105,7,46,'#e6b46f');a.rect(x+1,120,28,5,'#425c61')
                    a.rect(x+8,88,14,6,'#a4b39c')
                a.rect(68,22,11,23,'#536b70');a.rect(63,18,21,6,'#b5b99b')
            elif name=='ore-market':
                for x in [2,42,184]:
                    a.rect(x,137,34,24,'#947e58');a.rect(x+3,140,28,18,'#344d52')
                    for j in range(8):a.disc(x+5+random.randrange(24),140+random.randrange(16),3,ORE_COLORS[j%3])
                a.rect(48,103,46,9,'#b4ba92')
            elif name=='upgrade-shop':
                a.rect(42,12,11,35,'#607d7b');a.rect(39,9,18,5,'#bdd0ae')
                for x in range(70,176,23):a.rect(x,27,17,14,'#314d59');a.rect(x+2,29,13,3,'#9cbb9f')
                a.disc(74,112,16,'#a1baa0');a.disc(74,112,10,'#365761');a.disc(74,112,4,'#e9c77a')
            else:
                for x in [4,180]:
                    a.rect(x,132,41,29,'#5e756e');a.rect(x+3,136,35,21,'#293f4a');a.rect(x+18,134,5,25,'#bcaa72')
                a.rect(50,104,43,7,'#b9c8a4');a.rect(68,90,7,34,'#b9c8a4')
        for x in [20,220]:a.rect(x,167,3,3,'#e6cd8c')
        a.save(f'surface/{name}.png')
    for n in range(6):
        a=Art(180,280)
        a.rect(10,262,160,12,'#5e736d');a.rect(20,258,140,5,'#bdba92')
        for x in range(20,160,20):a.rect(x,264,10,4,'#d9a557')
        if n>=1:
            a.poly([(66,240),(66,83),(89,32),(112,83),(112,240)],'#1b303b')
            a.rect(70,86,38,149,'#88998b');a.rect(74,87,8,145,'#c0c6a9')
            a.poly([(69,85),(89,37),(109,85)],'#d0cbb0');a.line(89,42,89,85,'#f2e4bd')
            for y in range(100,228,28):a.rect(68,y,42,5,'#36515b')
        if n>=2:
            for x in [48,108]:a.rect(x,134,24,100,'#b4774b');a.rect(x+3,136,7,93,'#e3b372')
        if n>=3:
            a.disc(89,102,15,'#182f3c');a.disc(89,102,11,'#6faba7');a.disc(86,98,6,'#c2edd0')
            a.rect(81,128,17,5,'#9de2b4')
        if n>=4:
            a.poly([(67,187),(41,241),(67,234)],'#82978b');a.poly([(112,187),(139,241),(112,234)],'#c6c6a8')
            a.poly([(74,230),(104,230),(111,251),(67,251)],'#223a47');a.rect(72,242,33,7,'#5c7c7c')
        if n>=5:
            a.rect(76,166,27,24,'#254652');a.disc(89,178,8,'#e6ac5a');a.disc(89,178,4,'#fff0b0')
            a.rect(76,204,26,4,'#e6ac5a')
        a.save(f'rocket/stage{n}.png')


def icons():
    for idx,name in enumerate(['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']):
        a=Art(24,24);c='#c4d3b7'
        if name=='fuel':
            a.rect(6,5,11,16,c);a.rect(9,2,5,4,c);a.rect(8,9,7,8,'#cc9d56');a.rect(17,9,3,8,c)
        elif name=='hull':
            a.poly([(4,4),(12,2),(20,4),(19,15),(12,22),(5,15)],c);a.poly([(8,7),(16,7),(15,14),(12,17),(9,14)],'#5d897e')
        elif name=='cargo':
            a.rect(3,7,18,15,c);a.rect(5,9,14,11,'#466266');a.rect(10,4,4,6,c);a.rect(6,13,12,2,c)
        elif name=='credits':
            a.disc(12,12,10,'#d9af62');a.disc(12,12,7,'#5f6150');a.rect(8,8,9,2,'#e8cd8b');a.rect(8,8,2,9,'#e8cd8b');a.rect(8,15,9,2,'#e8cd8b')
        elif name=='depth':
            a.rect(10,2,4,14,c);a.poly([(4,12),(20,12),(12,22)],c)
        else:
            c=['#95e2ac','#9ec7ed','#ffba63'][idx-5];a.poly([(5,7),(12,2),(20,7),(18,17),(11,23),(4,16)],c);a.poly([(6,8),(12,4),(11,20)],'#ffffff88')
        a.save(f'icons/{name}.png')


def effects():
    defs={
        'gas-seep':(9,800,30,'#bacbb2',.35,5),
        'drill-debris':(22,500,100,'#c09a71',.85,3),
        'jetpack-exhaust':(30,400,140,'#ffbf67',.85,6),
        'ore-sparkle':(22,650,70,'#fff1b5',1,4),
        'material-shimmer':(45,1100,80,'#adf6d7',1,6),
        'gas-explosion':(90,900,220,'#ffb56b',1,13),
        'lava-embers':(25,650,80,'#fc8c4f',.8,6),
        'impact-dust':(35,750,90,'#acac94',.5,9),
        'core-extract':(65,1400,110,'#ffd4a1',.9,8),
        'core-detonation':(180,1500,390,'#ffd49a',1,22),
        'launch-exhaust':(100,1100,220,'#ffc37f',.9,20),
        'death-burst':(60,1000,130,'#a4d8c3',.8,9),
    }
    dest=ROOT/'assets/fx';dest.mkdir(parents=True,exist_ok=True)
    for name,(count,life,speed,color,opacity,size) in defs.items():
        config=TMP/f'{name}.json'
        cfg=dict(width=700,height=700,duration_ms=2400,fps=24,background='transparent',actions=str(TMP/f'{name}-ops.json'),preview=str(TMP/f'{name}.png'),system=str(dest/f'{name}.json'))
        config.write_text(json.dumps(cfg));run('particle-2d','--config',config,'init')
        down=name in ['jetpack-exhaust','launch-exhaust']
        run('particle-2d','--config',config,'add-emitter','--name','main','--shape','disc','--x',0,'--y',0,'--radius',15 if name=='gas-seep' else 4,'--burst',count,'--lifetime',life,'--lifetime-spread',life*.3,'--speed',speed,'--speed-spread',speed*.35,'--dir-y',-1 if down else 1,'--cone-angle',18 if down else 25 if name=='gas-seep' else 180)
        run('particle-2d','--config',config,'set-particle','--emitter','main','--size-from',size,'--size-to',size*1.7 if name=='gas-seep' else 0,'--opacity-from',opacity,'--opacity-to',0,'--color-gradient',f'{color}@0,#506566@1','--stretch',1.7 if down else 1)
        run('particle-2d','--config',config,'set-forces','--drag',1.8,'--gravity',10 if down else -90,'--turbulence','12,0.03')
        if 'explosion' in name or name=='core-detonation':
            for layer,num,sp,sz,dur,col in [('flash',1,0,60,130,'#fff8d4'),('shockwave',65,speed*1.3,4,400,'#fff0bf'),('shell',35,speed*.5,22,550,'#f77f49')]:
                run('particle-2d','--config',config,'add-emitter','--name',layer,'--shape','point','--x',0,'--y',0,'--burst',num,'--lifetime',dur,'--speed',sp,'--cone-angle',180)
                run('particle-2d','--config',config,'set-particle','--emitter',layer,'--size-from',sz,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient',f'{col}@0,#a6573f@1')
        run('particle-2d','--config',config,'render','--frame',12,'--out',TMP/f'{name}-preview.png')
        if not (dest/f'{name}.json').exists(): raise RuntimeError('Particle output missing')


def audio():
    dest=ROOT/'assets/audio';dest.mkdir(parents=True,exist_ok=True)
    for name in ['drill','thrust','ore-pickup','material-chime','gas-explosion','lava-sizzle','impact','fabricate','launch','death','alarm-fuel','alarm-core']:
        cfg=dict(sample_rate=44100,channels='mono',max_duration_ms=3000,seed=71,actions=str(TMP/f'{name}-audio.json'),preview=str(TMP/f'{name}-wave.png'),wav=str(dest/f'{name}.wav'),sample_pack='combat-core')
        config=TMP/'sound-config.json';config.write_text(json.dumps(cfg))
        tool='sfx-sample' if name in ['impact','ore-pickup','fabricate'] else 'sfx-synth'
        run(tool,'--config',config,'init')
        if tool=='sfx-sample':
            sample={'impact':'impact_metal_hollow','ore-pickup':'mech_clip_load','fabricate':'mech_ratchet'}[name]
            run(tool,'--config',config,'add-sample','--name',sample,'--t',0,'--gain',-23 if name!='impact' else -18,'--fade-out',140,'--trim','0,600')
        def voice(n,w,f,d,g,start=0,env='pluck'):
            run(tool,'--config',config,'add-voice','--name',n,'--wave',w,'--freq',f,'--dur',d,'--gain',g,'--start',start)
            run(tool,'--config',config,'set-envelope','--voice',n,'--env',env)
        if name in ['drill','thrust']:
            voice('machine','saw',68 if name=='drill' else 45,1000,-26,env='gate')
            voice('air','noise',100,1000,-27 if name=='drill' else -30,env='gate')
            run(tool,'--config',config,'add-filter','--voice','air','--type','lowpass','--cutoff',1800 if name=='drill' else 700)
            run(tool,'--config',config,'add-vibrato','--voice','machine','--rate',33 if name=='drill' else 8,'--depth',2)
        elif name in ['ore-pickup','material-chime','fabricate']:
            notes=[660,990] if name=='ore-pickup' else [392,587.33,783.99,1174.66] if name=='material-chime' else [220,330,440,660]
            for i,note in enumerate(notes):voice(f'tone{i}','sine',note,380,-22,start=i*65)
            voice('click','noise',100,50,-32)
        elif name in ['gas-explosion','impact','launch','death','lava-sizzle']:
            dur=2300 if name=='launch' else 1300 if name=='gas-explosion' else 700
            voice('body','noise',100,dur,-19 if name!='lava-sizzle' else -27,env='swell' if name=='launch' else 'punch')
            voice('sub','sine',90 if name!='impact' else 140,dur,-17)
            run(tool,'--config',config,'set-pitch','--voice','sub','--slide-to',25,'--over',dur)
            run(tool,'--config',config,'add-filter','--voice','body','--type','lowpass','--cutoff',950 if name!='lava-sizzle' else 3500)
        else:
            for i in range(2):voice(f'alarm{i}','triangle',520 if name=='alarm-fuel' else 740,160,-26,start=i*260,env='gate')
        run(tool,'--config',config,'render')
    cfg=dict(sample_rate=44100,channels='stereo',max_duration_ms=24000,seed=71,instrument_bank='gm-lite',actions=str(TMP/'music-ops.json'),preview=str(TMP/'music.png'),wav=str(dest/'music.wav'),mid=str(dest/'music.mid'))
    config=TMP/'music-config.json';config.write_text(json.dumps(cfg))
    run('music','--config',config,'init');run('music','--config',config,'set-tempo','--bpm',80)
    for name,inst,gain in [('abyss','synth_pad',-10),('echo','vibraphone',-10),('pulse','bass_electric',-12)]:
        run('music','--config',config,'define-track','--name',name,'--instrument',inst)
        run('music','--config',config,'set-track-fx','--track',name,'--gain',gain,'--reverb',.6,'--env','swell' if name=='abyss' else 'pluck')
    for bar,root in enumerate([38,34,41,36,38,34,41,36]):
        for note in [root,root+7,root+12]:run('music','--config',config,'add-note','--track','abyss','--pitch',note,'--t',bar*4,'--dur',3.9,'--velocity',55)
        for i in range(4):run('music','--config',config,'add-note','--track','pulse','--pitch',root-12,'--t',bar*4+i,'--dur',.3,'--velocity',52)
        for i,n in enumerate([root+24,root+31,root+26]):run('music','--config',config,'add-note','--track','echo','--pitch',n,'--t',bar*4+i*1.25,'--dur',.8,'--velocity',43)
    run('music','--config',config,'render')


if __name__=='__main__':
    import sys
    tasks={'art':lambda:(rock(),minerals(),miner(),surface(),icons()),'fx':effects,'audio':audio}
    for name in sys.argv[1:] or tasks:
        print(f'Authoring {name}...',flush=True);tasks[name]()
    print('Finished original Deepcore assets.',flush=True)
