// Articles d'épicerie les plus courants, par catégorie, dans les 7 langues.
// Ordre des langues dans chaque tableau : fr, en, es, pt, de, vi, ko.
// Ajouter un article = ajouter une ligne dans la bonne catégorie.

const LANGS = ["fr", "en", "es", "pt", "de", "vi", "ko"];

const RAW = [
  {
    id: "produce", icon: "🥕",
    name: ["Fruits et légumes", "Fruits and vegetables", "Frutas y verduras", "Frutas e legumes", "Obst und Gemüse", "Rau củ quả", "과일과 채소"],
    items: [
      ["Pommes", "Apples", "Manzanas", "Maçãs", "Äpfel", "Táo", "사과"],
      ["Bananes", "Bananas", "Plátanos", "Bananas", "Bananen", "Chuối", "바나나"],
      ["Oranges", "Oranges", "Naranjas", "Laranjas", "Orangen", "Cam", "오렌지"],
      ["Raisins", "Grapes", "Uvas", "Uvas", "Trauben", "Nho", "포도"],
      ["Fraises", "Strawberries", "Fresas", "Morangos", "Erdbeeren", "Dâu tây", "딸기"],
      ["Bleuets", "Blueberries", "Arándanos", "Mirtilos", "Heidelbeeren", "Việt quất", "블루베리"],
      ["Citrons", "Lemons", "Limones", "Limões", "Zitronen", "Chanh vàng", "레몬"],
      ["Avocats", "Avocados", "Aguacates", "Abacates", "Avocados", "Bơ", "아보카도"],
      ["Tomates", "Tomatoes", "Tomates", "Tomates", "Tomaten", "Cà chua", "토마토"],
      ["Concombres", "Cucumbers", "Pepinos", "Pepinos", "Gurken", "Dưa leo", "오이"],
      ["Laitue", "Lettuce", "Lechuga", "Alface", "Salat", "Xà lách", "상추"],
      ["Épinards", "Spinach", "Espinacas", "Espinafre", "Spinat", "Rau chân vịt", "시금치"],
      ["Carottes", "Carrots", "Zanahorias", "Cenouras", "Karotten", "Cà rốt", "당근"],
      ["Oignons", "Onions", "Cebollas", "Cebolas", "Zwiebeln", "Hành tây", "양파"],
      ["Ail", "Garlic", "Ajo", "Alho", "Knoblauch", "Tỏi", "마늘"],
      ["Pommes de terre", "Potatoes", "Papas", "Batatas", "Kartoffeln", "Khoai tây", "감자"],
      ["Brocoli", "Broccoli", "Brócoli", "Brócolis", "Brokkoli", "Bông cải xanh", "브로콜리"],
      ["Poivrons", "Bell peppers", "Pimientos", "Pimentões", "Paprika", "Ớt chuông", "파프리카"],
      ["Champignons", "Mushrooms", "Champiñones", "Cogumelos", "Champignons", "Nấm", "버섯"],
      ["Céleri", "Celery", "Apio", "Aipo", "Sellerie", "Cần tây", "셀러리"],
    ],
  },
  {
    id: "dairy", icon: "🥛",
    name: ["Produits laitiers et œufs", "Dairy and eggs", "Lácteos y huevos", "Laticínios e ovos", "Milchprodukte und Eier", "Sữa và trứng", "유제품과 달걀"],
    items: [
      ["Lait", "Milk", "Leche", "Leite", "Milch", "Sữa tươi", "우유"],
      ["Œufs", "Eggs", "Huevos", "Ovos", "Eier", "Trứng", "달걀"],
      ["Beurre", "Butter", "Mantequilla", "Manteiga", "Butter", "Bơ lạt", "버터"],
      ["Yogourt", "Yogurt", "Yogur", "Iogurte", "Joghurt", "Sữa chua", "요거트"],
      ["Fromage cheddar", "Cheddar cheese", "Queso cheddar", "Queijo cheddar", "Cheddar", "Phô mai cheddar", "체다 치즈"],
      ["Fromage mozzarella", "Mozzarella", "Queso mozzarella", "Muçarela", "Mozzarella", "Phô mai mozzarella", "모차렐라 치즈"],
      ["Crème", "Cream", "Crema", "Creme de leite", "Sahne", "Kem tươi", "생크림"],
      ["Crème sure", "Sour cream", "Crema agria", "Creme azedo", "Saure Sahne", "Kem chua", "사워크림"],
      ["Fromage cottage", "Cottage cheese", "Requesón", "Queijo cottage", "Hüttenkäse", "Phô mai tươi", "코티지 치즈"],
      ["Boisson végétale", "Plant-based milk", "Bebida vegetal", "Bebida vegetal", "Pflanzendrink", "Sữa hạt", "식물성 우유"],
    ],
  },
  {
    id: "meat", icon: "🥩",
    name: ["Viandes", "Meat", "Carnes", "Carnes", "Fleisch", "Thịt", "육류"],
    items: [
      ["Bœuf haché", "Ground beef", "Carne molida de res", "Carne moída", "Rinderhackfleisch", "Thịt bò xay", "소고기 다짐육"],
      ["Poitrines de poulet", "Chicken breasts", "Pechugas de pollo", "Peito de frango", "Hähnchenbrust", "Ức gà", "닭가슴살"],
      ["Cuisses de poulet", "Chicken thighs", "Muslos de pollo", "Coxas de frango", "Hähnchenschenkel", "Đùi gà", "닭다리"],
      ["Poulet entier", "Whole chicken", "Pollo entero", "Frango inteiro", "Ganzes Hähnchen", "Gà nguyên con", "통닭"],
      ["Côtelettes de porc", "Pork chops", "Chuletas de cerdo", "Costeletas de porco", "Schweinekoteletts", "Sườn heo", "돼지갈비"],
      ["Porc haché", "Ground pork", "Carne molida de cerdo", "Carne de porco moída", "Schweinehackfleisch", "Thịt heo xay", "돼지고기 다짐육"],
      ["Bacon", "Bacon", "Tocino", "Bacon", "Speck", "Thịt xông khói", "베이컨"],
      ["Jambon", "Ham", "Jamón", "Presunto", "Schinken", "Giăm bông", "햄"],
      ["Saucisses", "Sausages", "Salchichas", "Linguiças", "Würstchen", "Xúc xích", "소시지"],
      ["Steak", "Steak", "Bistec", "Bife", "Steak", "Bít tết", "스테이크"],
    ],
  },
  {
    id: "fish", icon: "🐟",
    name: ["Poissons et fruits de mer", "Fish and seafood", "Pescados y mariscos", "Peixes e frutos do mar", "Fisch und Meeresfrüchte", "Cá và hải sản", "생선과 해산물"],
    items: [
      ["Saumon", "Salmon", "Salmón", "Salmão", "Lachs", "Cá hồi", "연어"],
      ["Thon en conserve", "Canned tuna", "Atún en lata", "Atum em lata", "Thunfisch in der Dose", "Cá ngừ hộp", "참치 통조림"],
      ["Crevettes", "Shrimp", "Camarones", "Camarão", "Garnelen", "Tôm", "새우"],
      ["Tilapia", "Tilapia", "Tilapia", "Tilápia", "Tilapia", "Cá rô phi", "틸라피아"],
      ["Morue", "Cod", "Bacalao", "Bacalhau", "Kabeljau", "Cá tuyết", "대구"],
      ["Truite", "Trout", "Trucha", "Truta", "Forelle", "Cá hồi suối", "송어"],
    ],
  },
  {
    id: "bakery", icon: "🥖",
    name: ["Boulangerie", "Bakery", "Panadería", "Padaria", "Bäckerei", "Bánh mì", "베이커리"],
    items: [
      ["Pain", "Bread", "Pan", "Pão", "Brot", "Bánh mì", "식빵"],
      ["Bagels", "Bagels", "Bagels", "Bagels", "Bagels", "Bánh bagel", "베이글"],
      ["Tortillas", "Tortillas", "Tortillas", "Tortilhas", "Tortillas", "Bánh tortilla", "토르티야"],
      ["Muffins anglais", "English muffins", "Muffins ingleses", "Muffins ingleses", "Englische Muffins", "Bánh muffin Anh", "잉글리시 머핀"],
      ["Croissants", "Croissants", "Cruasanes", "Croissants", "Croissants", "Bánh sừng bò", "크루아상"],
      ["Pains à hamburger", "Hamburger buns", "Panes de hamburguesa", "Pães de hambúrguer", "Burgerbrötchen", "Bánh hamburger", "햄버거 번"],
    ],
  },
  {
    id: "pantry", icon: "🥫",
    name: ["Garde-manger", "Pantry", "Despensa", "Despensa", "Vorrat", "Đồ khô", "식료품 저장실"],
    items: [
      ["Riz", "Rice", "Arroz", "Arroz", "Reis", "Gạo", "쌀"],
      ["Pâtes", "Pasta", "Pasta", "Macarrão", "Nudeln", "Mì Ý", "파스타"],
      ["Sauce tomate", "Tomato sauce", "Salsa de tomate", "Molho de tomate", "Tomatensauce", "Sốt cà chua", "토마토소스"],
      ["Farine", "Flour", "Harina", "Farinha", "Mehl", "Bột mì", "밀가루"],
      ["Sucre", "Sugar", "Azúcar", "Açúcar", "Zucker", "Đường", "설탕"],
      ["Huile d'olive", "Olive oil", "Aceite de oliva", "Azeite", "Olivenöl", "Dầu ô liu", "올리브유"],
      ["Céréales", "Cereal", "Cereales", "Cereal", "Müsli", "Ngũ cốc", "시리얼"],
      ["Gruau", "Oatmeal", "Avena", "Aveia", "Haferflocken", "Yến mạch", "오트밀"],
      ["Beurre d'arachide", "Peanut butter", "Crema de cacahuate", "Pasta de amendoim", "Erdnussbutter", "Bơ đậu phộng", "땅콩버터"],
      ["Confiture", "Jam", "Mermelada", "Geleia", "Marmelade", "Mứt", "잼"],
      ["Haricots en conserve", "Canned beans", "Frijoles en lata", "Feijão em lata", "Bohnen in der Dose", "Đậu hộp", "콩 통조림"],
      ["Soupe en conserve", "Canned soup", "Sopa enlatada", "Sopa em lata", "Dosensuppe", "Súp đóng hộp", "수프 통조림"],
      ["Café", "Coffee", "Café", "Café", "Kaffee", "Cà phê", "커피"],
      ["Thé", "Tea", "Té", "Chá", "Tee", "Trà", "차"],
      ["Sirop d'érable", "Maple syrup", "Jarabe de arce", "Xarope de bordo", "Ahornsirup", "Si-rô phong", "메이플 시럽"],
      ["Ketchup", "Ketchup", "Kétchup", "Ketchup", "Ketchup", "Tương cà", "케첩"],
      ["Moutarde", "Mustard", "Mostaza", "Mostarda", "Senf", "Mù tạt", "머스터드"],
      ["Mayonnaise", "Mayonnaise", "Mayonesa", "Maionese", "Mayonnaise", "Sốt mayonnaise", "마요네즈"],
    ],
  },
  {
    id: "frozen", icon: "🧊",
    name: ["Surgelés", "Frozen", "Congelados", "Congelados", "Tiefkühlkost", "Đồ đông lạnh", "냉동식품"],
    items: [
      ["Légumes surgelés", "Frozen vegetables", "Verduras congeladas", "Legumes congelados", "Tiefkühlgemüse", "Rau đông lạnh", "냉동 채소"],
      ["Petits fruits surgelés", "Frozen berries", "Frutos rojos congelados", "Frutas vermelhas congeladas", "Tiefkühlbeeren", "Quả mọng đông lạnh", "냉동 베리"],
      ["Pizza surgelée", "Frozen pizza", "Pizza congelada", "Pizza congelada", "Tiefkühlpizza", "Pizza đông lạnh", "냉동 피자"],
      ["Frites surgelées", "Frozen fries", "Papas fritas congeladas", "Batata frita congelada", "Tiefkühlpommes", "Khoai tây chiên đông lạnh", "냉동 감자튀김"],
      ["Crème glacée", "Ice cream", "Helado", "Sorvete", "Eiscreme", "Kem", "아이스크림"],
    ],
  },
  {
    id: "snacks", icon: "🍪",
    name: ["Collations", "Snacks", "Botanas", "Lanches", "Snacks", "Đồ ăn vặt", "간식"],
    items: [
      ["Craquelins", "Crackers", "Galletas saladas", "Biscoitos salgados", "Cracker", "Bánh quy giòn", "크래커"],
      ["Croustilles", "Chips", "Papas fritas de bolsa", "Batatinhas", "Chips", "Khoai tây lát", "감자칩"],
      ["Noix", "Nuts", "Nueces", "Castanhas", "Nüsse", "Các loại hạt", "견과류"],
      ["Barres tendres", "Granola bars", "Barras de granola", "Barras de cereal", "Müsliriegel", "Thanh ngũ cốc", "그래놀라 바"],
      ["Biscuits", "Cookies", "Galletas", "Biscoitos", "Kekse", "Bánh quy", "쿠키"],
      ["Chocolat", "Chocolate", "Chocolate", "Chocolate", "Schokolade", "Sô-cô-la", "초콜릿"],
    ],
  },
  {
    id: "drinks", icon: "🧃",
    name: ["Boissons", "Drinks", "Bebidas", "Bebidas", "Getränke", "Đồ uống", "음료"],
    items: [
      ["Jus d'orange", "Orange juice", "Jugo de naranja", "Suco de laranja", "Orangensaft", "Nước cam", "오렌지 주스"],
      ["Eau pétillante", "Sparkling water", "Agua con gas", "Água com gás", "Sprudelwasser", "Nước có ga", "탄산수"],
      ["Eau en bouteille", "Bottled water", "Agua embotellada", "Água engarrafada", "Wasser in Flaschen", "Nước đóng chai", "생수"],
      ["Boissons gazeuses", "Soft drinks", "Refrescos", "Refrigerantes", "Limonade", "Nước ngọt", "탄산음료"],
    ],
  },
  {
    id: "household", icon: "🧻",
    name: ["Hygiène et entretien", "Personal care and household", "Higiene y limpieza", "Higiene e limpeza", "Drogerie und Haushalt", "Vệ sinh và gia dụng", "생활용품"],
    items: [
      ["Papier hygiénique", "Toilet paper", "Papel higiénico", "Papel higiênico", "Toilettenpapier", "Giấy vệ sinh", "화장지"],
      ["Essuie-tout", "Paper towels", "Toallas de papel", "Papel-toalha", "Küchenrolle", "Khăn giấy bếp", "키친타월"],
      ["Savon à vaisselle", "Dish soap", "Jabón para platos", "Detergente de louça", "Spülmittel", "Nước rửa chén", "주방 세제"],
      ["Détergent à lessive", "Laundry detergent", "Detergente para ropa", "Sabão para roupa", "Waschmittel", "Bột giặt", "세탁 세제"],
      ["Dentifrice", "Toothpaste", "Pasta de dientes", "Pasta de dente", "Zahnpasta", "Kem đánh răng", "치약"],
      ["Shampoing", "Shampoo", "Champú", "Xampu", "Shampoo", "Dầu gội", "샴푸"],
      ["Savon", "Soap", "Jabón", "Sabonete", "Seife", "Xà phòng", "비누"],
      ["Sacs à ordures", "Garbage bags", "Bolsas de basura", "Sacos de lixo", "Müllbeutel", "Túi rác", "쓰레기봉투"],
    ],
  },
];

// Le catalogue dans une langue : [{ id, icon, name, items: ["Pommes", …] }].
export function catalog(lang) {
  const k = Math.max(0, LANGS.indexOf(lang));
  return RAW.map((c) => ({ id: c.id, icon: c.icon, name: c.name[k], items: c.items.map((i) => i[k]) }));
}

export const CATEGORY_IDS = RAW.map((c) => c.id);
export const CATALOG_LANGS = LANGS;
// Pour les tests : chaque article et chaque catégorie a ses 7 noms.
export const RAW_CATALOG = RAW;
