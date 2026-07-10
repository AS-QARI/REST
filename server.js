require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// اختبار الاتصال بـ Supabase
app.get('/api/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('_analytics')
      .select('*')
      .limit(1);

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Supabase connection failed',
        error: error.message
      });
    }

    res.json({
      status: 'success',
      message: 'Connected to Supabase',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل على البورت ${PORT}`);
  console.log(`📊 اختبر الاتصال على: http://localhost:${PORT}/api/health`);
});
