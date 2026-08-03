/*The entery point to the API*/
import express from "express";
import dotenv from "dotenv";
import {connectDB} from './config/db.js';
import productRouter from './routes/product.Routs.js';
import oilRouter from './routes/oil.Routs.js';
import bottleRouter from './routes/bottle.Routs.js';
import alcoholRouter from './routes/alcohol.Routs.js';
import orderRouter from './routes/order.Routs.js';
import customerRouter from './routes/customer.Routs.js'
import reportRouter from './routes/report.Routs.js';
import cors from "cors";
import dns from "dns";


dns.setServers([
  "8.8.8.8",
  "1.1.1.1"
])

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json())//allows us to accept JSON data in the req.body
console.log(process.env.MONGO_URI)
app.use('/api/products',productRouter);
app.use('/api/oils',oilRouter);
app.use('/api/bottles',bottleRouter);
app.use('/api/alcohols',alcoholRouter);
app.use('/api/orders',orderRouter);
app.use('/api/customers',customerRouter);
app.use('/api/reports',reportRouter);
app.listen(port , () => {
    connectDB();
    console.log(`Server Started at port ${port}!!`)
});


