// Articles courants à emporter en voyage, par catégorie, dans les 7 langues
// (fr, en, es, pt, de, vi, ko). Même forme que le catalogue d'épicerie ; on
// les coche pour les mettre dans la liste « À emporter » du voyage.

import { sortNames } from "../grocery/catalog.js";

const LANGS = ["fr", "en", "es", "pt", "de", "vi", "ko"];

const RAW = [
  {
    id: "documents", icon: "🛂",
    name: ["Documents et argent", "Documents and money", "Documentos y dinero", "Documentos e dinheiro", "Dokumente und Geld", "Giấy tờ và tiền", "서류와 돈"],
    items: [
      ["Passeport", "Passport", "Pasaporte", "Passaporte", "Reisepass", "Hộ chiếu", "여권"],
      ["Visa", "Visa", "Visa", "Visto", "Visum", "Thị thực", "비자"],
      ["Permis de conduire", "Driver's license", "Licencia de conducir", "Carteira de motorista", "Führerschein", "Bằng lái xe", "운전면허증"],
      ["Carte d'assurance maladie", "Health insurance card", "Tarjeta del seguro médico", "Cartão do plano de saúde", "Krankenversicherungskarte", "Thẻ bảo hiểm y tế", "건강보험증"],
      ["Assurance voyage", "Travel insurance", "Seguro de viaje", "Seguro-viagem", "Reiseversicherung", "Bảo hiểm du lịch", "여행자 보험"],
      ["Billets d'avion", "Plane tickets", "Boletos de avión", "Passagens aéreas", "Flugtickets", "Vé máy bay", "항공권"],
      ["Réservations d'hôtel", "Hotel reservations", "Reservas de hotel", "Reservas de hotel", "Hotelreservierungen", "Đặt phòng khách sạn", "호텔 예약 확인서"],
      ["Cartes bancaires", "Bank cards", "Tarjetas bancarias", "Cartões bancários", "Bankkarten", "Thẻ ngân hàng", "은행 카드"],
      ["Argent comptant", "Cash", "Efectivo", "Dinheiro em espécie", "Bargeld", "Tiền mặt", "현금"],
      ["Copies des documents", "Document copies", "Copias de documentos", "Cópias dos documentos", "Kopien der Dokumente", "Bản sao giấy tờ", "서류 사본"],
      ["Clés de la maison", "House keys", "Llaves de casa", "Chaves de casa", "Hausschlüssel", "Chìa khóa nhà", "집 열쇠"],
    ],
  },
  {
    id: "clothes", icon: "👕",
    name: ["Vêtements", "Clothing", "Ropa", "Roupas", "Kleidung", "Quần áo", "의류"],
    items: [
      ["T-shirts", "T-shirts", "Camisetas", "Camisetas", "T-Shirts", "Áo thun", "티셔츠"],
      ["Chemises", "Shirts", "Camisas", "Camisas", "Hemden", "Áo sơ mi", "셔츠"],
      ["Pantalons", "Pants", "Pantalones", "Calças", "Hosen", "Quần dài", "바지"],
      ["Shorts", "Shorts", "Pantalones cortos", "Bermudas", "Kurze Hosen", "Quần short", "반바지"],
      ["Sous-vêtements", "Underwear", "Ropa interior", "Roupas íntimas", "Unterwäsche", "Đồ lót", "속옷"],
      ["Chaussettes", "Socks", "Calcetines", "Meias", "Socken", "Tất", "양말"],
      ["Pyjama", "Pajamas", "Pijama", "Pijama", "Schlafanzug", "Đồ ngủ", "잠옷"],
      ["Chandail", "Sweater", "Suéter", "Suéter", "Pullover", "Áo len", "스웨터"],
      ["Veste", "Jacket", "Chaqueta", "Jaqueta", "Jacke", "Áo khoác", "재킷"],
      ["Manteau d'hiver", "Winter coat", "Abrigo de invierno", "Casaco de inverno", "Wintermantel", "Áo khoác mùa đông", "겨울 코트"],
      ["Imperméable", "Raincoat", "Impermeable", "Capa de chuva", "Regenjacke", "Áo mưa", "우비"],
      ["Maillot de bain", "Swimsuit", "Traje de baño", "Roupa de banho", "Badeanzug", "Đồ bơi", "수영복"],
      ["Robe", "Dress", "Vestido", "Vestido", "Kleid", "Váy", "원피스"],
      ["Tenue habillée", "Dressy outfit", "Ropa formal", "Roupa social", "Elegante Kleidung", "Trang phục lịch sự", "정장"],
      ["Chaussures de marche", "Walking shoes", "Zapatos para caminar", "Tênis de caminhada", "Wanderschuhe", "Giày đi bộ", "워킹화"],
      ["Sandales", "Sandals", "Sandalias", "Sandálias", "Sandalen", "Dép xăng-đan", "샌들"],
      ["Chapeau", "Hat", "Sombrero", "Chapéu", "Hut", "Mũ", "모자"],
      ["Tuque", "Winter hat", "Gorro de invierno", "Gorro", "Mütze", "Mũ len", "비니"],
      ["Gants", "Gloves", "Guantes", "Luvas", "Handschuhe", "Găng tay", "장갑"],
      ["Foulard", "Scarf", "Bufanda", "Cachecol", "Schal", "Khăn quàng", "목도리"],
      ["Ceinture", "Belt", "Cinturón", "Cinto", "Gürtel", "Thắt lưng", "벨트"],
    ],
  },
  {
    id: "toiletries", icon: "🪥",
    name: ["Trousse de toilette", "Toiletries", "Artículos de aseo", "Higiene pessoal", "Kulturbeutel", "Đồ vệ sinh cá nhân", "세면도구"],
    items: [
      ["Brosse à dents", "Toothbrush", "Cepillo de dientes", "Escova de dente", "Zahnbürste", "Bàn chải đánh răng", "칫솔"],
      ["Dentifrice", "Toothpaste", "Pasta de dientes", "Pasta de dente", "Zahnpasta", "Kem đánh răng", "치약"],
      ["Soie dentaire", "Dental floss", "Hilo dental", "Fio dental", "Zahnseide", "Chỉ nha khoa", "치실"],
      ["Déodorant", "Deodorant", "Desodorante", "Desodorante", "Deodorant", "Lăn khử mùi", "데오드란트"],
      ["Shampoing", "Shampoo", "Champú", "Xampu", "Shampoo", "Dầu gội", "샴푸"],
      ["Revitalisant", "Conditioner", "Acondicionador", "Condicionador", "Spülung", "Dầu xả", "린스"],
      ["Savon", "Soap", "Jabón", "Sabonete", "Seife", "Xà phòng", "비누"],
      ["Brosse ou peigne", "Hairbrush or comb", "Cepillo o peine", "Escova ou pente", "Bürste oder Kamm", "Lược", "빗"],
      ["Rasoir", "Razor", "Rastrillo", "Lâmina de barbear", "Rasierer", "Dao cạo", "면도기"],
      ["Maquillage", "Makeup", "Maquillaje", "Maquiagem", "Make-up", "Đồ trang điểm", "화장품"],
      ["Crème solaire", "Sunscreen", "Protector solar", "Protetor solar", "Sonnencreme", "Kem chống nắng", "선크림"],
      ["Chasse-moustiques", "Insect repellent", "Repelente de insectos", "Repelente", "Mückenschutz", "Thuốc chống muỗi", "모기 기피제"],
      ["Crème hydratante", "Moisturizer", "Crema hidratante", "Hidratante", "Feuchtigkeitscreme", "Kem dưỡng ẩm", "보습제"],
      ["Coupe-ongles", "Nail clippers", "Cortaúñas", "Cortador de unhas", "Nagelknipser", "Bấm móng tay", "손톱깎이"],
      ["Produits menstruels", "Menstrual products", "Productos menstruales", "Absorventes", "Monatshygiene", "Băng vệ sinh", "생리대"],
      ["Lingettes", "Wipes", "Toallitas", "Lenços umedecidos", "Feuchttücher", "Khăn ướt", "물티슈"],
    ],
  },
  {
    id: "health", icon: "💊",
    name: ["Santé", "Health", "Salud", "Saúde", "Gesundheit", "Sức khỏe", "건강"],
    items: [
      ["Médicaments", "Medications", "Medicamentos", "Remédios", "Medikamente", "Thuốc", "복용 약"],
      ["Ordonnances", "Prescriptions", "Recetas médicas", "Receitas médicas", "Rezepte", "Đơn thuốc", "처방전"],
      ["Trousse de premiers soins", "First aid kit", "Botiquín", "Kit de primeiros socorros", "Erste-Hilfe-Set", "Bộ sơ cứu", "구급상자"],
      ["Analgésiques", "Pain relievers", "Analgésicos", "Analgésicos", "Schmerzmittel", "Thuốc giảm đau", "진통제"],
      ["Antihistaminiques", "Antihistamines", "Antihistamínicos", "Antialérgicos", "Antihistaminika", "Thuốc chống dị ứng", "항히스타민제"],
      ["Médicament contre le mal des transports", "Motion sickness medicine", "Medicina para el mareo", "Remédio para enjoo", "Mittel gegen Reiseübelkeit", "Thuốc say xe", "멀미약"],
      ["Désinfectant pour les mains", "Hand sanitizer", "Gel desinfectante", "Álcool em gel", "Handdesinfektion", "Nước rửa tay khô", "손 소독제"],
      ["Lunettes", "Glasses", "Lentes", "Óculos de grau", "Brille", "Kính mắt", "안경"],
      ["Verres de contact", "Contact lenses", "Lentes de contacto", "Lentes de contato", "Kontaktlinsen", "Kính áp tròng", "콘택트렌즈"],
      ["Bouchons d'oreilles", "Earplugs", "Tapones para los oídos", "Protetores auriculares", "Ohrstöpsel", "Nút tai", "귀마개"],
      ["Masques", "Face masks", "Cubrebocas", "Máscaras", "Masken", "Khẩu trang", "마스크"],
    ],
  },
  {
    id: "electronics", icon: "🔌",
    name: ["Électronique", "Electronics", "Electrónica", "Eletrônicos", "Elektronik", "Đồ điện tử", "전자기기"],
    items: [
      ["Téléphone", "Phone", "Teléfono", "Celular", "Handy", "Điện thoại", "휴대폰"],
      ["Chargeur de téléphone", "Phone charger", "Cargador del teléfono", "Carregador do celular", "Handy-Ladegerät", "Sạc điện thoại", "휴대폰 충전기"],
      ["Batterie externe", "Power bank", "Batería portátil", "Carregador portátil", "Powerbank", "Sạc dự phòng", "보조 배터리"],
      ["Adaptateur de prise", "Plug adapter", "Adaptador de enchufe", "Adaptador de tomada", "Reisestecker", "Ổ cắm chuyển đổi", "여행용 어댑터"],
      ["Écouteurs", "Headphones", "Audífonos", "Fones de ouvido", "Kopfhörer", "Tai nghe", "이어폰"],
      ["Tablette", "Tablet", "Tableta", "Tablet", "Tablet", "Máy tính bảng", "태블릿"],
      ["Ordinateur portable", "Laptop", "Computadora portátil", "Notebook", "Laptop", "Máy tính xách tay", "노트북"],
      ["Appareil photo", "Camera", "Cámara", "Câmera", "Kamera", "Máy ảnh", "카메라"],
      ["Câbles", "Cables", "Cables", "Cabos", "Kabel", "Dây cáp", "케이블"],
      ["Liseuse", "E-reader", "Lector electrónico", "Leitor digital", "E-Reader", "Máy đọc sách", "전자책 단말기"],
    ],
  },
  {
    id: "practical", icon: "🎒",
    name: ["Pratique", "Practical", "Práctico", "Prático", "Praktisches", "Đồ tiện dụng", "생활용품"],
    items: [
      ["Sac à dos", "Backpack", "Mochila", "Mochila", "Rucksack", "Ba lô", "배낭"],
      ["Oreiller de voyage", "Travel pillow", "Almohada de viaje", "Travesseiro de viagem", "Nackenkissen", "Gối du lịch", "여행용 베개"],
      ["Masque pour les yeux", "Sleep mask", "Antifaz para dormir", "Máscara de dormir", "Schlafmaske", "Bịt mắt ngủ", "수면 안대"],
      ["Bouteille d'eau", "Water bottle", "Botella de agua", "Garrafa de água", "Trinkflasche", "Bình nước", "물병"],
      ["Collations", "Snacks", "Botanas", "Lanches", "Snacks", "Đồ ăn vặt", "간식"],
      ["Cadenas", "Padlock", "Candado", "Cadeado", "Vorhängeschloss", "Ổ khóa", "자물쇠"],
      ["Sacs réutilisables", "Reusable bags", "Bolsas reutilizables", "Sacolas reutilizáveis", "Stofftaschen", "Túi tái sử dụng", "장바구니"],
      ["Parapluie", "Umbrella", "Paraguas", "Guarda-chuva", "Regenschirm", "Ô", "우산"],
      ["Lunettes de soleil", "Sunglasses", "Lentes de sol", "Óculos de sol", "Sonnenbrille", "Kính râm", "선글라스"],
      ["Livre", "Book", "Libro", "Livro", "Buch", "Sách", "책"],
      ["Stylo", "Pen", "Pluma", "Caneta", "Kugelschreiber", "Bút", "펜"],
      ["Sac pour linge sale", "Laundry bag", "Bolsa para ropa sucia", "Saco para roupa suja", "Wäschebeutel", "Túi đựng đồ bẩn", "빨래 주머니"],
      ["Étiquettes à bagages", "Luggage tags", "Etiquetas para equipaje", "Etiquetas de bagagem", "Gepäckanhänger", "Thẻ hành lý", "수하물 태그"],
    ],
  },
  {
    id: "outdoors", icon: "🏖️",
    name: ["Plage et plein air", "Beach and outdoors", "Playa y aire libre", "Praia e ar livre", "Strand und Outdoor", "Biển và dã ngoại", "해변과 야외"],
    items: [
      ["Serviette de plage", "Beach towel", "Toalla de playa", "Toalha de praia", "Strandtuch", "Khăn tắm biển", "비치 타월"],
      ["Lunettes de natation", "Swim goggles", "Goggles", "Óculos de natação", "Schwimmbrille", "Kính bơi", "수경"],
      ["Sac de plage", "Beach bag", "Bolsa de playa", "Bolsa de praia", "Strandtasche", "Túi đi biển", "비치 백"],
      ["Lampe de poche", "Flashlight", "Linterna", "Lanterna", "Taschenlampe", "Đèn pin", "손전등"],
      ["Jumelles", "Binoculars", "Binoculares", "Binóculos", "Fernglas", "Ống nhòm", "쌍안경"],
      ["Sac étanche", "Dry bag", "Bolsa impermeable", "Saco estanque", "Packsack", "Túi chống nước", "방수 가방"],
      ["Après-soleil", "After-sun lotion", "Loción para después del sol", "Pós-sol", "After-Sun-Lotion", "Kem dưỡng sau nắng", "애프터선 로션"],
      ["Glacière", "Cooler", "Hielera", "Caixa térmica", "Kühlbox", "Thùng giữ lạnh", "아이스박스"],
    ],
  },
];

// Le catalogue dans une langue, articles triés : [{ id, icon, name, items }].
export function packingCatalog(lang) {
  const k = Math.max(0, LANGS.indexOf(lang));
  return RAW.map((c) => ({ id: c.id, icon: c.icon, name: c.name[k], items: sortNames(c.items.map((i) => i[k]), LANGS[k]) }));
}

export const RAW_PACKING = RAW;
