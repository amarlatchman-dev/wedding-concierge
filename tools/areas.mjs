// Shapes for the illustrated resort map, traced from the Neejanand venue map (1600 x 1131 pixel space).
// kind controls the look; marker links a tappable shape to a place on the map.
const P = (pts) => pts.map((p) => p.join(',')).join(' ');
export const areas = [
  { id: 'grounds', kind: 'grounds', pts: P([[645, 30], [1460, 72], [1578, 58], [1580, 442], [1420, 448], [1440, 640], [1500, 822], [1345, 858], [1392, 1004], [1000, 1092], [880, 765], [850, 682], [130, 748], [42, 700], [42, 660], [250, 560], [640, 468]]) },
  { id: 'cottagezone', kind: 'paving', pts: P([[688, 104], [1386, 104], [1386, 346], [916, 346], [916, 655], [598, 652], [578, 500], [688, 330]]) },
  { id: 'westpath', kind: 'paving', pts: P([[916, 652], [1300, 645], [1300, 668], [850, 685], [130, 750], [120, 728], [850, 662]]) },
  { id: 'eastroad', kind: 'paving', pts: P([[1290, 640], [1316, 640], [1316, 1010], [1290, 1010]]) },
  { id: 'poolgarden', kind: 'lawn', marker: 'mainlawn', pts: P([[922, 352], [1392, 352], [1392, 436], [1300, 438], [1300, 445], [1052, 445], [1052, 642], [922, 650]]) },
  { id: 'aptgarden', kind: 'lawn', marker: 'aptgarden', pts: P([[1392, 146], [1456, 146], [1456, 436], [1394, 436]]) },
  { id: 'apartments', kind: 'building', label: 'Apartments 201–208', pts: P([[1466, 80], [1556, 80], [1556, 436], [1466, 436]]) },
  { id: 'jalsa', kind: 'lawn', marker: 'jalsa', pts: P([[262, 604], [296, 566], [370, 556], [440, 566], [505, 600], [522, 660], [512, 700], [420, 712], [300, 716], [248, 700], [244, 646]]) },
  { id: 'courtyard', kind: 'lawn', marker: 'courtyard', pts: P([[910, 156], [1010, 222], [910, 292], [812, 222]]) },
  { id: 'southlawn', kind: 'lawn-soft', pts: P([[858, 690], [1288, 672], [1288, 1004], [1004, 1086], [884, 765]]) },
  { id: 'track', kind: 'track', marker: 'scenic', pts: P([[934, 742], [1060, 716], [1212, 704], [1262, 752], [1268, 960], [1240, 1020], [1150, 1056], [1040, 1046], [990, 990], [962, 900]]) },
  { id: 'scenic', kind: 'lawn', marker: 'scenic', label: 'Scenic Garden', pts: P([[956, 756], [1062, 734], [1200, 724], [1240, 762], [1246, 952], [1222, 1002], [1148, 1034], [1050, 1026], [1008, 978], [982, 894]]) },
  { id: 'nzone', kind: 'venue-building', marker: 'nzone', pts: P([[1060, 664], [1150, 662], [1150, 688], [1060, 690]]) },
  { id: 'clubhouse', kind: 'building', marker: 'pool', pts: P([[1068, 448], [1298, 444], [1298, 545], [1220, 545], [1220, 640], [1068, 640]]) },
  { id: 'pool', kind: 'water', marker: 'pool', label: 'Pool', pts: P([[1102, 452], [1214, 452], [1214, 486], [1102, 486]]) },
  { id: 'banquet', kind: 'venue-building', marker: 'banquet', pts: P([[1222, 482], [1296, 482], [1296, 614], [1222, 614]]) },
  { id: 'parking', kind: 'parking', marker: 'parking', label: 'Parking', pts: P([[1308, 452], [1414, 452], [1430, 630], [1308, 630]]) },
  { id: 'reception', kind: 'building', marker: 'reception', label: 'Reception & Restaurant', pts: P([[1322, 636], [1446, 636], [1452, 800], [1350, 830], [1322, 830]]) },
  { id: 'temple', kind: 'venue-building', marker: 'temple', pts: P([[84, 682], [150, 668], [170, 706], [104, 722]]) },
  { id: 'gazebo', kind: 'venue-building', marker: 'gazebo', circle: [262, 588, 14] },
  { id: 'kids', kind: 'plaza', marker: 'kids', label: "Kids' Zone", pts: P([[856, 690], [906, 688], [912, 742], [872, 746]]) },
  { id: 'duck', kind: 'building', marker: 'duck', circle: [1012, 1068, 12] },
];
// Rows of the amphitheatre, drawn as arcs around the stage.
export const amphitheatre = { marker: 'amphi', cx: 150, cy: 690, radii: [52, 66, 80, 94], from: -98, to: -8 };
