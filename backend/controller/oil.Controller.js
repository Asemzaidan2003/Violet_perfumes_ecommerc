import Oil from '../models/oil.model.js';
import { stockUpdate } from '../utils/restock.js';
import { invalidateCatalog } from '../store/catalog.js';
import { isNum } from './product.Controller.js';
import { syncStockStatusSafe } from '../services/stockStatus.js';

export const createOil = async (req , res)=>{
    const {id , oil_name , oil_cost , oil_quantity , status} = req.body;

    //Validate required fields
    if(!String(id ?? "").trim() || !String(oil_name ?? "").trim() || !isNum(oil_cost) || !isNum(oil_quantity)){
        return res.status(400).json({success:false ,message: "يرجى تعبئة رقم الزيت واسمه وتكلفته وكميته" });
    }

    //Create new Oil
    const newOil = new Oil({
        id,
        oil_name,
        oil_cost,
        oil_quantity,
        status
    });

    await newOil.save();//we insert the data here
    await syncStockStatusSafe();
    invalidateCatalog();
    return res.status(200).json({success:true , message:"Oil data inserted successfully" , data:newOil});
};

export const updateOil = async (req , res)=>{
    const update = stockUpdate(req.body, "oil_quantity");
    const updatedOil = await Oil.findOneAndUpdate(
        { id: req.params.id },
        update,
        { new: true }
    );
    if(!updatedOil){
        return res.status(404).json({
            success: false,
            message: `No Oil found with this ID: ${req.params.id}`,
        });
    }
    await syncStockStatusSafe();
    invalidateCatalog();
    return res.status(200).json({
        success:true,
        message:"Oil data updated successfully",
        data:(await Oil.findById(updatedOil._id)) ?? updatedOil
    })
};

export const getOils = async (req,res) => {
    const oils = await Oil.find({});
    if(oils.length === 0){
        return res.status(404).json({
            success:false,
            message:"No data found",
            data:null
        });
    }
    return res.status(200).json({
        success:true,
        message:"Oils data retrieved successfully",
        data:oils

    })
};

export const getOilById = async (req,res)=>{
    const id = req.params.id;
    const oil = await Oil.findOne({id: id});
    if(!oil){
        return res.status(404).json({
            success:false,
            message:`No oil found with id : ${id}`,
            data:null
        });
    }
    return res.status(200).json({
        success:true,
        message:"Oil found",
        data:oil
    })
}

export const deleteOil = async (req , res)=>{
    const id = req.params.id;
    const deletedOil = await Oil.findOneAndDelete({id: id});
    if(!deletedOil){
        return res.status(404).json({
            success:false,
            message:`No oil found with id : ${id}`,
            data:null
        });
    }
    await syncStockStatusSafe();
    invalidateCatalog();
    return res.status(200).json({
        success:true,
        message:"Oil deleted",
        data:null
    })
}

export const calculateOilCapital = async (req, res) => {
    const oilData = await Oil.find({});

    if (oilData.length === 0) {
        return res.status(404).json({
            success: false,
            message: "No data found",
            data: null
        });
    }
    const totalQuantity = oilData.reduce((sum , oil)=>sum+Math.max(0, oil.oil_quantity) , 0)
    const totalCapital = oilData.reduce((sum , oil)=>sum+Math.max(0, oil.oil_quantity)*oil.oil_cost,0)
    res.status(200).json({
        success: true,
        message: "Capital calculated successfully",
        data: {
            quantity:totalQuantity,
            capital:totalCapital
        }
    });
};
/*
{
  "_id": ObjectId("oil_id"),
  "oil_name": "Oil Name",
  "oil_cost": 5.00,
  "oil_quantity": 50,
  "status": "available",
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/
