const supabase = require('../config/supabase');

// مثال 1: الحصول على جميع البيانات من جدول
async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');

  if (error) console.error('خطأ:', error);
  return data;
}

// مثال 2: الحصول على بيانات محددة
async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) console.error('خطأ:', error);
  return data;
}

// مثال 3: إضافة سجل جديد
async function createUser(userData) {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select();

  if (error) console.error('خطأ:', error);
  return data;
}

// مثال 4: تحديث سجل
async function updateUser(id, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) console.error('خطأ:', error);
  return data;
}

// مثال 5: حذف سجل
async function deleteUser(id) {
  const { data, error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) console.error('خطأ:', error);
  return data;
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
