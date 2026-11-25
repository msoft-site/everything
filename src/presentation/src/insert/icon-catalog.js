// Categories for the Insert Icons dialog. The drawings are the Lucide icon
// set (ISC licence, see public/THIRD_PARTY_NOTICES.txt), loaded only when the
// dialog opens. Names not present in the installed version are skipped;
// search covers every icon, by the words in its name.

export const ICON_CATEGORIES = [
  [
    "人物",
    "User Users UserRound UsersRound UserCheck UserPlus UserMinus UserX UserCog Contact Baby PersonStanding Accessibility HandHeart Handshake Hand HandHelping Smile Frown Meh Laugh Angry Annoyed SmilePlus Speech Ear Eye Brain Footprints",
  ],
  [
    "商业",
    "Briefcase BriefcaseBusiness Building Building2 Landmark Factory Store Warehouse ChartLine ChartBar ChartPie ChartColumn ChartArea ChartNoAxesCombined TrendingUp TrendingDown Target Goal Award Trophy Medal Presentation Projector Handshake BadgeDollarSign DollarSign Euro PoundSterling JapaneseYen Bitcoin Wallet CreditCard Banknote PiggyBank Receipt Calculator Coins Scale Gavel Signature FileSignature ClipboardList ClipboardCheck Kanban Network Workflow",
  ],
  [
    "通讯",
    "Mail MailOpen Send Inbox MessageCircle MessageSquare MessagesSquare Phone PhoneCall PhoneIncoming PhoneOutgoing Video Voicemail AtSign Megaphone Bell BellRing Rss Radio Podcast Mic Headphones Speaker Share Share2 Reply Forward Quote",
  ],
  [
    "科技",
    "Laptop Monitor Smartphone Tablet Tv Keyboard Mouse Printer Server Database HardDrive Cpu MemoryStick Router Wifi Bluetooth Cloud CloudUpload CloudDownload Usb Battery BatteryCharging Plug Code Code2 Terminal Bug Bot Binary Webhook Satellite QrCode ScanLine Fingerprint Gamepad2 Headset Cable",
  ],
  [
    "教育",
    "GraduationCap School BookOpen Book Library Notebook NotebookPen PenTool Pencil Ruler Calculator Microscope FlaskConical TestTube Atom Dna Lightbulb Brain Puzzle Globe Languages Backpack Shapes Sigma Pi Infinity",
  ],
  [
    "箭头",
    "ArrowRight ArrowLeft ArrowUp ArrowDown ArrowUpRight ArrowDownRight ArrowBigRight ArrowBigLeft ArrowBigUp ArrowBigDown ChevronRight ChevronLeft ChevronUp ChevronDown ChevronsRight ChevronsLeft MoveRight MoveLeft Repeat RefreshCw RotateCw RotateCcw Undo2 Redo2 Shuffle Merge Split CornerDownRight CornerUpLeft CircleArrowRight CircleArrowUp ArrowLeftRight ArrowUpDown Expand Shrink",
  ],
  [
    "界面",
    "Check CheckCheck X Plus Minus Search Settings Settings2 SlidersHorizontal Menu House Star Heart Bookmark Flag Tag Pin MapPin Lock Unlock Key Shield ShieldCheck Info CircleHelp CircleAlert TriangleAlert Ban Trash2 Pencil Copy Clipboard Download Upload ExternalLink Link Filter Grid3x3 List LayoutGrid Eye EyeOff Power ToggleLeft ToggleRight",
  ],
  [
    "自然",
    "Leaf Trees TreePine TreeDeciduous Flower Flower2 Sprout Clover Mountain MountainSnow Waves Droplet Droplets Sun Moon Cloud CloudRain CloudSnow CloudLightning Snowflake Wind Rainbow Sunrise Sunset Flame Bug Bird Fish Rabbit Squirrel Cat Dog PawPrint Turtle Shell Feather Earth",
  ],
  [
    "旅行与地点",
    "Plane PlaneTakeoff PlaneLanding Car CarFront Bus Train TrainFront Ship Sailboat Bike Truck Fuel Map MapPin Navigation Compass Globe Hotel Tent Luggage Ticket Castle Church Landmark Building TowerControl Anchor Signpost Route Milestone",
  ],
  [
    "餐饮",
    "Coffee CupSoda Wine Beer Martini GlassWater Milk Pizza Sandwich Salad Soup Croissant Cake CakeSlice Cookie Candy IceCreamCone Apple Banana Cherry Citrus Grape Carrot Egg Fish Beef Drumstick UtensilsCrossed Utensils ChefHat Wheat",
  ],
  [
    "健康",
    "Heart HeartPulse Activity Stethoscope Pill Syringe Thermometer Hospital Ambulance Cross Bandage Brain Bone Dna Microscope Accessibility Apple Dumbbell Bike Footprints Baby ShieldPlus",
  ],
  [
    "媒体",
    "Camera Image Images Film Clapperboard Video Music Music2 Mic Headphones Play Pause CirclePlay SkipForward SkipBack Volume2 VolumeX Radio Tv Disc3 Aperture Palette Brush PaintBucket Sparkles Wand Star",
  ],
  [
    "时间与天气",
    "Clock Clock3 AlarmClock Timer Hourglass Calendar CalendarDays CalendarCheck CalendarClock History Watch Sun Moon CloudSun CloudRain Umbrella Snowflake Thermometer Wind Sunrise",
  ],
  [
    "安全",
    "Lock LockOpen Key KeyRound Shield ShieldCheck ShieldAlert ShieldX Fingerprint ScanFace Eye EyeOff UserLock Siren BadgeCheck Vault",
  ],
  [
    "形状与符号",
    "Circle Square Triangle Diamond Hexagon Octagon Pentagon Star Heart Spade Club Shapes Infinity Hash Asterisk Percent Equal Sigma Pi Omega Ampersand AtSign CircleDot Dot Sparkle Zap",
  ],
];

/** Lucide names split into searchable words ("ArrowUpRight" → "arrow up right"). */
export const iconWords = (name) =>
  name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z]{2,})([0-9])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
