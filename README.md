# Pharmacy POS System

A full-stack Point-of-Sale application designed to streamline pharmacy sales and inventory management.

## Overview

This project provides a digital workflow for managing pharmacy products, processing sales, monitoring inventory, and viewing business statistics.

It was built as a practical full-stack application with a focus on:

* Role-based access control
* Inventory management
* Point-of-sale workflows
* Sales and profit tracking
* Expiry-date handling
* Dashboard analytics

## Features

* 🔐 User authentication and role-based access
* 💊 Medicine and inventory management
* 🛒 Point-of-sale checkout
* 🧾 Receipt generation
* 📦 Stock tracking
* 📅 Expiry-date monitoring
* 💰 Sales and profit tracking
* 📊 Dashboard statistics
* 🔎 Medicine search
* 📜 Sales history

### Clinic features

* 🧑‍⚕️ Patient records (ID, contact details, date of birth, allergies, medical notes)
* 🩺 Patient visits at the POS: doctor, symptoms, diagnosis, notes
* 💵 Doctor (consultation) fee, with an admin-set default, counted in revenue and profit
* 💊 Medicines given to the patient are deducted from pharmacy stock automatically
* 📝 Dosage instructions per medicine, printed on the receipt
* 📚 Patient history: every past visit with diagnosis, medicines, dosage and fees
* ⚠️ Allergy warning shown when a patient is selected
* 🏥 Consultation-only visits (doctor fee, no medicines) are supported
* Plain pharmacy walk-in sales still work: just don't select a patient

## License

This project is licensed under the MIT License.
