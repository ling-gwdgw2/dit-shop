# 🌸 Dit Shop — Gift Card Store

ຮ້ານຄ້າບັດຂອງຂວັນ (Gift Card Store) ແບບ Full-stack ທີ່ອອກແບບດ້ວຍທິມດອກກຸຫຼາບສີຊົມພູ (Pink Rose Theme) ພັດທະນາດ້ວຍ Node.js/Express, Vanilla HTML/CSS/JS ແລະ ເຊື່ອມຕໍ່ຖານຂໍ້ມູນ Google Cloud Firestore ພາຍໃຕ້ລະບົບ Firebase Serverless.

---

## 📄 ເອກະສານໂຄງການ (Documentation)

* **ສະຖາປັດຕະຍະກຳລະບົບ**: ອ່ານລາຍລະອຽດແຜນຜັງລະບົບ ແລະ ໂຄງສ້າງຖານຂໍ້ມູນໄດ້ທີ່ [ARCHITECTURE.md (ພາສາລາວ)](ARCHITECTURE.md)
* **ຄູ່ມືການຕິດຕັ້ງ ແລະ ເລີ່ມຕົ້ນໃຊ້ງານ**: ອ່ານໄດ້ທີ່ [SETUP.md](Dit%20shop%20\(1\)/Dit%20shop/SETUP.md) ແລະ [README ຫຼັກຂອງແອັບພລິເຄຊັນ](Dit%20shop%20\(1\)/Dit%20shop/README.md)

---

## 📂 ໂຄງສ້າງໂຄງການ (Project Layout)

```text
Dit shop (1)/
├── ARCHITECTURE.md                 ← ເອກະສານສະຖາປັດຕະຍະກຳລະບົບ (ພາສາລາວ)
├── firebase.json                   ← ການຕັ້ງຄ່າ Firebase (Hosting & Functions)
├── functions/                      ← Firebase Cloud Functions Wrapper (API Ingress)
└── Dit shop (1)/Dit shop/          ← ແອັບພລິເຄຊັນຫຼັກ
    ├── backend/                    ← Express.js API Server
    ├── frontend/                   ← ສ່ວນຕິດຕໍ່ຜູ້ໃຊ້ (HTML / CSS / JS)
    └── database/                   ← database schema
```

---

## 🚀 ການເລີ່ມຕົ້ນໃຊ້ງານດ່ວນ (Quick Start)

### 1. ຕັ້ງຄ່າຖານຂໍ້ມູນ (Database Setup)
ລະບົບໃຊ້ Cloud Firestore ໂດຍມີລະບົບ Auto-Seeding ເມື່ອເລີ່ມເຮັດວຽກ. ສາມາດວາງໄຟລ໌ຄີຄວາມປອດໄພ `service-account.json` ໄວ້ທີ່ `backend/service-account.json` ເພື່ອເຊື່ອມຕໍ່ໃນເຄື່ອງ Local.

### 2. ຕິດຕັ້ງ ແລະ ເລີ່ມ Backend
```bash
How to use the new scripts:
Instead of navigating into the nested subfolders, you can now run these commands directly from the root of your workspace:

To install dependencies for all folders (root, backend, and functions):
bash
npm run install:all
To start the backend server:
bash
npm start
To start the backend server in development mode (using nodemon):
bash
npm run dev
To run the Firebase local emulators:
bash
npm run emulate
All changes are fully recorded in 
walkthrough.md
.
```
ເຊີບເວີຈະເຮັດວຽກຢູ່ທີ່ **http://localhost:3000** 

---

## 🔒 ຄວາມປອດໄພ (Security)
* ລະຫັດລັບຕ່າງໆ ຈະຖືກເກັບໄວ້ໃນ Environment Variables ຜ່ານ `.env` ແລະ `.gitignore` ຈະປ້ອງກັນບໍ່ໃຫ້ອັບໂຫຼດຂໍ້ມູນຄວາມລັບ (ເຊັ່ນ `service-account.json`) ຂຶ້ນ GitHub ໂດຍເດັດຂາດ.
