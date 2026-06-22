app.get("/db-test", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 as test");
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});