from flask import Flask, jsonify, request, render_template
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///currency_rates.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class CurrencyRate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    currency_code = db.Column(db.String(10), nullable=False)
    currency_name = db.Column(db.String(50), nullable=False)
    rate = db.Column(db.Float, nullable=False)
    change_percentage = db.Column(db.Float, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'currency_code': self.currency_code,
            'currency_name': self.currency_name,
            'rate': self.rate,
            'change_percentage': self.change_percentage,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        }

class RateHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    currency_code = db.Column(db.String(10), nullable=False)
    rate = db.Column(db.Float, nullable=False)
    change_percentage = db.Column(db.Float, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'currency_code': self.currency_code,
            'rate': self.rate,
            'change_percentage': self.change_percentage,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
def admin():
    return render_template('admin/index.html')

@app.route('/api/currency-rates', methods=['GET'])
def get_currency_rates():
    rates = CurrencyRate.query.all()
    return jsonify([rate.to_dict() for rate in rates])

@app.route('/api/currency-history/<currency_code>', methods=['GET'])
def get_currency_history(currency_code):
    history = RateHistory.query.filter_by(currency_code=currency_code).order_by(RateHistory.updated_at.desc()).limit(10).all()
    return jsonify([entry.to_dict() for entry in history])

@app.route('/api/update-rate', methods=['POST'])
def update_currency_rate():
    data = request.json
    currency_code = data.get('currency_code')
    new_rate = data.get('rate')

    current_rate = CurrencyRate.query.filter_by(currency_code=currency_code).first()
    
    if current_rate:
        # احتساب نسبة التغيير
        change_percentage = ((new_rate - current_rate.rate) / current_rate.rate) * 100

        # حفظ السجل الحالي في التاريخ
        history_entry = RateHistory(
            currency_code=current_rate.currency_code,
            rate=current_rate.rate,
            change_percentage=current_rate.change_percentage,
            updated_at=current_rate.updated_at
        )
        db.session.add(history_entry)

        # تحديث السعر الحالي
        current_rate.rate = new_rate
        current_rate.change_percentage = change_percentage
        current_rate.updated_at = datetime.utcnow()
    else:
        # إنشاء سعر جديد إذا لم يكن موجودًا
        current_rate = CurrencyRate(
            currency_code=currency_code,
            currency_name=data.get('currency_name', ''),
            rate=new_rate,
            change_percentage=0
        )
        db.session.add(current_rate)

    db.session.commit()
    return jsonify(current_rate.to_dict()), 200

def init_db():
    with app.app_context():
        db.create_all()
        
        # إضافة العملات الأساسية إذا لم تكن موجودة
        currencies = [
            {'code': 'usd', 'name': 'الدولار الأمريكي', 'rate': 530},
            {'code': 'eur', 'name': 'اليورو', 'rate': 580},
            {'code': 'sar', 'name': 'الريال السعودي', 'rate': 141},
            {'code': 'aed', 'name': 'الدرهم الإماراتي', 'rate': 144}
        ]

        for currency in currencies:
            existing = CurrencyRate.query.filter_by(currency_code=currency['code']).first()
            if not existing:
                new_currency = CurrencyRate(
                    currency_code=currency['code'],
                    currency_name=currency['name'],
                    rate=currency['rate']
                )
                db.session.add(new_currency)
        
        db.session.commit()

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
